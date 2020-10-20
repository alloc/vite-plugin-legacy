import legacyPlugin from 'vite-plugin-legacy'
import reactPlugin from 'vite-plugin-react'
import type { UserConfig } from 'vite'

const config: UserConfig = {
  jsx: 'react',
  sourcemap: true,
  esbuildTarget: 'es2018',
  plugins: [
    reactPlugin,
    legacyPlugin({
      targets: 'defaults',
    }),
  ],
}

export default config
