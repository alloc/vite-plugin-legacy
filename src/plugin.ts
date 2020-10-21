import type { BuildConfig, Plugin } from 'vite'
import type { Options as EnvOptions } from '@babel/preset-env'
import {
  rollup,
  OutputChunk,
  Plugin as RollupPlugin,
} from 'vite/node_modules/rollup'
import commonJS from 'vite/node_modules/@rollup/plugin-commonjs'
import dedent from 'dedent'
import babel from '@babel/core'
import path from 'path'

/** Plugin configuration */
type Config = {
  targets?: EnvOptions['targets']
  ignoreBrowserslistConfig?: boolean
}

export default (config: Config = {}): Plugin => ({
  configureBuild(viteConfig) {
    if (!viteConfig.write) return

    const babelEnv = getBabelEnv(config)
    const getLoader = createScriptFactory(
      viteConfig.esbuildTarget.toLowerCase()
    )

    return async build => {
      const [mainChunk] = build.assets
      const legacyChunk = await createLegacyChunk(
        mainChunk,
        viteConfig,
        babelEnv
      )

      build.assets.push(legacyChunk)
      build.html = build.html.replace(
        /<script type="module" src="([^"]+)"><\/script>/g,
        (match, moduleId) =>
          path.basename(moduleId) == mainChunk.fileName
            ? getLoader(
                moduleId,
                path.posix.resolve(moduleId, '..', legacyChunk.fileName)
              )
            : match
      )
    }
  },
})

// Only es2018+ are tested since the `script.noModule` check
// is enough for earlier ES targets.
const syntaxTests: { [target: string]: string } = {
  // Spread operator, dot-all regexp, async generator
  es2018: 'void ({...{}}, /0/s, async function*(){})',
  // Optional catch binding
  es2019: 'try{} catch{}',
  // Optional chaining
  es2020: '0?.$',
}

const getBabelEnv = ({
  targets = 'defaults',
  ignoreBrowserslistConfig,
}: Config): EnvOptions => ({
  bugfixes: true,
  useBuiltIns: 'usage',
  corejs: 3,
  targets,
  ignoreBrowserslistConfig,
})

/**
 * The script factory returns a script element that loads the modern bundle
 * when syntax requirements are met, else the legacy bundle is loaded.
 */
function createScriptFactory(target: string) {
  // The modern bundle is *not* loaded when its JavaScript version is unsupported.
  const syntaxTest = syntaxTests[target]

  // The modern bundle is *not* loaded when import/export syntax is unsupported.
  const moduleTest = 'script.noModule.$'

  return (modernBundleId: string, legacyBundleId: string) => dedent`
    <script>
      (function() {
        var script = document.createElement('script')
        try {
          ${moduleTest}
          eval('${syntaxTest}')
          script.type = 'module'
          script.src = '${modernBundleId}'
        } catch(e) {
          script.src = '${legacyBundleId}'
        }
        document.head.appendChild(script)
      })()
    </script>
  `
}

async function createLegacyChunk(
  mainChunk: OutputChunk,
  viteConfig: BuildConfig,
  babelEnv: EnvOptions
) {
  // Transform the modern bundle into a dinosaur.
  const transformed = await babel.transformAsync(mainChunk.code!, {
    configFile: false,
    inputSourceMap: mainChunk.map,
    sourceMaps: viteConfig.sourcemap,
    presets: [[require.resolve('@babel/preset-env'), babelEnv]],
  })
  if (!transformed) {
    throw Error('[vite-plugin-legacy] Failed to transform modern bundle')
  }

  const legacyPath = path.resolve(
    viteConfig.root,
    viteConfig.outDir,
    viteConfig.assetsDir,
    mainChunk.fileName.replace(/\.js$/, '.legacy.js')
  )

  const plugins: RollupPlugin[] = [
    commonJS({
      sourceMap: viteConfig.sourcemap,
    }),
    {
      name: 'vite-legacy:resolve',
      resolveId(id) {
        if (id == legacyPath) return id
        if (/^(core-js|regenerator-runtime)\//.test(id)) {
          return require.resolve(id)
        }
      },
      load(id) {
        if (id == legacyPath)
          return {
            code: transformed.code!,
            map: transformed.map,
          }
      },
    },
  ]

  // Use rollup-plugin-terser even if "minify" option is esbuild.
  if (viteConfig.minify)
    plugins.push(
      require('vite/node_modules/rollup-plugin-terser').terser(
        viteConfig.terserOption
      )
    )

  // Merge core-js into the legacy bundle.
  const bundle = await rollup({
    input: legacyPath,
    plugins,
  })

  // Generate the legacy bundle.
  const { output } = await bundle.generate({
    file: legacyPath,
    format: 'iife',
    sourcemap: viteConfig.sourcemap,
    sourcemapExcludeSources: true,
    inlineDynamicImports: true,
  })

  return output[0]
}
