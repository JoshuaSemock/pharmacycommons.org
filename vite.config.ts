import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Vite config — https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // The source is public (GPL-3.0), so publish source maps: readable stack
    // traces in the browser, and it clears Lighthouse's "missing source maps".
    sourcemap: true,
    modulePreload: false,
    rolldownOptions: {
      output: {
        // Third-party code changes far less often than ours. Keeping it in its
        // own chunks means a site update doesn't make returning visitors
        // re-download React and the Supabase client.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
          ],
        },
      },
    },
  },
})
