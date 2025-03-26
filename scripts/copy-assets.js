const fs = require('fs-extra');

// Copy assets to 'dist/assets'
fs.copySync('./assets', './docs/assets');

console.log('Assets copied successfully');
