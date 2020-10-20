import dts from 'rollup-plugin-dts'
import esbuild from 'rollup-plugin-esbuild'

const name = require('./package.json').main.replace(/\.js$/, '')

const bundle = format => ({
  input: 'src/plugin.ts',
  output: {
    file: `${name}.${format == 'dts' ? 'd.ts' : 'js'}`,
    format: format == 'dts' ? 'esm' : 'cjs',
    exports: 'named',
    sourcemap: format != 'dts',
    sourcemapExcludeSources: true,
  },
  plugins: format == 'dts' ? [dts()] : [esbuild({ target: 'es2018' })],
  external: id => !/^[./]/.test(id),
})

export default [
  bundle('cjs'), //
  bundle('dts'),
]
