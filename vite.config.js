import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    server: {
      port: 3000,
      open: true,
      hmr: {
        host: 'localhost'
      }
    },
    build: {
      // Produciton config
      sourcemap: mode === 'development', // Only sourcemap in dev
      minify: 'esbuild', // Use esbuild (built-in)
      rollupOptions: {
        output: {
          // Cache busting for production
          entryFileNames: mode === 'production' ? 'assets/[name]-[hash].js' : 'assets/[name].js',
          chunkFileNames: mode === 'production' ? 'assets/[name]-[hash].js' : 'assets/[name].js',
          assetFileNames: mode === 'production' ? 'assets/[name]-[hash].[ext]' : 'assets/[name].[ext]'
        }
      }
    },
    define: {
      // Global env variables
      'import.meta.env.VITE_APP_ENV': JSON.stringify(mode)
    }
  }
})