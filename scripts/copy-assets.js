const fs = require('fs-extra');
const path = require('path');

async function copyAssets() {
  try {
    // Copy Pixi.js to dist folder
    await fs.copy(
      path.resolve(__dirname, '../node_modules/pixi.js/dist'),
      path.resolve(__dirname, '../dist/pixi.js')
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

// Ensure the promise is handled
copyAssets().then(() => {
  console.log('Asset copy process completed');
}).catch((err) => {
  console.error('Unhandled error in asset copy:', err);
  process.exit(1);
});
