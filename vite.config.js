import { defineConfig } from 'vite'

export default defineConfig({
  // Set the base path for GitHub Pages (replace with your repo name)
  base: '/your-repo-name/',

  resolve: {
    alias: {
      'pixi.js': 'pixi.js/dist/pixi.mjs',
      'pixi-viewport': 'pixi-viewport/dist/viewport.esm.js'
    }
  },

  // Ensure these modules are pre-bundled
  optimizeDeps: {
    include: ['pixi.js', 'pixi-viewport']
  }
})
