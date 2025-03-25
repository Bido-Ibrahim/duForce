const fs = require('fs-extra');

// Copy assets to 'dist/assets'
fs.copySync('./assets', './dist/assets');

console.log('Assets copied successfully');
