@ -4,17 +4,22 @@
  async function copyAssets() {
    try {
      // Copy Pixi.js to dist folder
      // Copy Pixi.js
      await fs.copy(
        path.resolve(__dirname, '../node_modules/pixi.js/dist'),
        path.resolve(__dirname, '../dist/pixi.js'),
    );
      console.log('Pixi.js assets copied successfully');
      // Copy Pixi Viewport
      await fs.copy(
        path.resolve(__dirname, '../node_modules/pixi-viewport/dist'),
        path.resolve(__dirname, '../dist/pixi-viewport')
      );
      console.log('Pixi-viewport.js assets copied successfully');
    } catch (err) {
      console.error('Error copying assets:', err);
    }
  }

copyAssets();
