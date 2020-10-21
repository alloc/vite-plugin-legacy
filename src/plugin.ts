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
import { KnownPolyfill, knownPolyfills } from './polyfills'

/** Plugin configuration */
type Config = {
  /** Define which browsers must be supported */
  targets?: EnvOptions['targets']
  /** Define which polyfills to load from Polyfill.io */
  polyfills?: KnownPolyfill[]
  /** Use inlined `core-js@3` modules instead of Polyfill.io */
  corejs?: boolean
  /** Disable browserslint configuration */
  ignoreBrowserslistConfig?: boolean
}

export default (config: Config = {}): Plugin => ({
  configureBuild(viteConfig) {
    if (!viteConfig.write) return

    // This function renders the bundle loading script.
    const renderScript = createScriptFactory(
      viteConfig.esbuildTarget.toLowerCase(),
      config
    )

    return async build => {
      const [mainChunk] = build.assets
      const legacyChunk = await createLegacyChunk(mainChunk, viteConfig, config)

      build.assets.push(legacyChunk)
      build.html = build.html.replace(
        /<script type="module" src="([^"]+)"><\/script>/g,
        (match, moduleId) =>
          path.basename(moduleId) == mainChunk.fileName
            ? renderScript(
                moduleId,
                path.posix.resolve(moduleId, '..', legacyChunk.fileName),
                !config.corejs &&
                  /\bregeneratorRuntime\b/.test(legacyChunk.code)
              )
            : match
      )
    }
  },
})

const regeneratorUrl = 'https://cdn.jsdelivr.net/npm/regenerator-runtime@0.13.7'

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
  corejs,
}: Config): EnvOptions => ({
  bugfixes: true,
  useBuiltIns: corejs && 'usage',
  corejs: 3,
  targets,
  ignoreBrowserslistConfig,
})

/**
 * The script factory returns a script element that loads the modern bundle
 * when syntax requirements are met, else the legacy bundle is loaded.
 */
function createScriptFactory(target: string, config: Config) {
  const polyfills = (config.polyfills || [])
    .filter(name => {
      if (!knownPolyfills.includes(name)) {
        throw Error(`Unknown polyfill: "${name}"`)
      }
      return true
    })
    .sort()

  // Include polyfills for the expected JavaScript version.
  if (!config.corejs) {
    const targetYear = parseTargetYear(target)
    for (let year = Math.min(targetYear, 2019); year >= 2015; --year) {
      polyfills.unshift('es' + year)
    }
  }

  // Polyfills are only loaded for the legacy bundle.
  const polyfillHost = 'https://polyfill.io/v3/polyfill.min.js?version=3.53.1'
  const polyfillScript =
    polyfills.length > 0 &&
    `load('${polyfillHost}&features=${polyfills.join(',')}')`

  // The modern bundle is *not* loaded when its JavaScript version is unsupported.
  const syntaxTest = syntaxTests[target]

  // The modern bundle is *not* loaded when import/export syntax is unsupported.
  const moduleTest = 'script.noModule.$'

  return (
    modernBundleId: string,
    legacyBundleId: string,
    needsRegenerator: boolean
  ) => dedent`
    <script>
      (function() {
        var script = document.createElement('script')
        function load(src, type) {
          script = script.cloneNode()
          script.type = type || ''
          script.src = src
          document.head.appendChild(script)
        }
        try {
          ${joinLines(
            moduleTest,
            syntaxTest && `eval('${syntaxTest}')`,
            `load('${modernBundleId}', 'module')`
          )}
        } catch(e) {
          ${joinLines(
            polyfillScript,
            needsRegenerator && `load('${regeneratorUrl}')`,
            `load('${legacyBundleId}')`
          )}
        }
      })()
    </script>
  `
}

function joinLines(...lines: (string | false)[]) {
  return lines.filter(Boolean).join('\n')
}

/** Convert `esbuildTarget` to a version year (eg: "es6" ➜ 2015). */
function parseTargetYear(target: string) {
  if (target == 'es5' || target == 'esnext') {
    throw Error('[vite-legacy] Unsupported "esbuildTarget" value: ${target}')
  }
  const version = Number(/\d+/.exec(target)![0])
  return version + (version < 2000 ? 2009 : 0)
}

async function createLegacyChunk(
  mainChunk: OutputChunk,
  viteConfig: BuildConfig,
  config: Config
): Promise<OutputChunk> {
  const presets: babel.PluginItem[] = [
    [require('@babel/preset-env'), getBabelEnv(config)],
  ]
  if (!config.corejs) {
    presets.push(require('@babel/plugin-transform-regenerator'))
  }

  // Transform the modern bundle into a dinosaur.
  const transformed = await babel.transformAsync(mainChunk.code, {
    configFile: false,
    inputSourceMap: mainChunk.map,
    sourceMaps: viteConfig.sourcemap,
    presets,
  })

  const { code, map } = transformed || {}
  if (!code) {
    throw Error('[vite-plugin-legacy] Failed to transform modern bundle')
  }

  const fileName = mainChunk.fileName.replace(/\.js$/, '.legacy.js')

  // Skip the Rollup build unless corejs is enabled.
  if (!config.corejs) {
    return {
      type: 'chunk',
      fileName,
      code,
      map: map && JSON.stringify(map),
    } as any
  }

  const legacyPath = path.resolve(
    viteConfig.root,
    viteConfig.outDir,
    viteConfig.assetsDir,
    fileName
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
        if (id == legacyPath) {
          return { code, map }
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
