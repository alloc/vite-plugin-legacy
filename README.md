# vite-plugin-legacy

Easily generate a legacy bundle for outdated browser support.

```ts
import legacyPlugin from 'vite-plugin-legacy'

export default {
  plugins: [
    // The default options are listed below. Pass nothing to use them.
    legacyPlugin({
      // The browsers that must be supported by your legacy bundle.
      // https://babeljs.io/docs/en/babel-preset-env#targets
      targets: [
        '> 0.5%',
        'last 2 versions',
        'Firefox ESR',
        'not dead',
      ],
      // Define which polyfills your legacy bundle needs. They will be loaded
      // from the Polyfill.io server. See the "Polyfills" section for more info.
      polyfills: [
        // Empty by default
      ],
      // Toggles whether or not browserslist config sources are used.
      // https://babeljs.io/docs/en/babel-preset-env#ignorebrowserslistconfig
      ignoreBrowserslistConfig: false,
      // When true, core-js@3 modules are inlined based on usage.
      // When false, global namespace APIs (eg: Object.entries) are loaded
      // from the Polyfill.io server.
      corejs: false,
    })
  ]
}
```

&nbsp;

### Features

- **Based on `@babel/preset-env`**  
  Easily customize which browsers you want to support (via the `targets` option).

- **Automatic feature detection**  
  The injected `<script>` that decides which bundle to load will check whether
  ES modules (eg: `import`) and the expected JavaScript version (determined by
  `esbuildTarget` in your Vite config) are supported by the user's browser.
  If not, the legacy bundle is loaded instead!

- **Usage-based `core-js@3` inlining**  
  Modern features are detected by Babel, and only the [`core-js`] polyfills that 
  are needed will be embedded in the legacy bundle.

- **Sourcemap support**  
  Set `sourcemap: true` in your Vite config to easily debug your production
  bundles.

- **Minify support**  
  When `minify` is truthy in your Vite config, the legacy bundle (which includes
  any `core-js` polyfills) is minified with [`terser`]. Customize the minifier
  via the `terserOption` in your Vite config.

- **Production only**  
  The legacy bundle is only generated when `vite build` runs, because Vite never
  bundles during development (that's the whole point of Vite).

[`core-js`]: https://www.npmjs.com/package/core-js
[`terser`]: https://www.npmjs.com/package/terser

&nbsp;

### Compatibility

The latest version of Vite does *not* support this plugin.

You need to clone Vite locally and checkout this PR:

- https://github.com/vitejs/vite/pull/878
