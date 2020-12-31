import legacyPlugin from 'vite-plugin-legacy'
import reactPlugin from '@vitejs/plugin-react-refresh'
import type { UserConfig } from 'vite'

const config: UserConfig = {
  build: {
    sourcemap: true,
  },
  esbuild: {
    target: 'es2018',
  },
  plugins: [
    reactPlugin,
    legacyPlugin({
      targets: 'defaults',
    }),
  ],
}

export default config
