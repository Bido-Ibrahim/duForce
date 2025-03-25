const fs = require('fs-extra');
const path = require('path');

async function copyAssets() {
  try {
    // Copy Pixi.js to dist folder
    await fs.copy(
      path.resolve(__dirname, '../node_modules/pixi.js/dist'),
      path.resolve(__dirname, '../dist/pixi.js')
    path.resolve(__dirname, '../dist/pixi-viewport.js')
    );
    console.log('Pixi.js assets copied successfully');
  } catch (err) {
    console.error('Error copying assets:', err);
  }
}

copyAssets();
