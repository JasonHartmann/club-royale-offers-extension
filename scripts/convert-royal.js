const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const svgPath = path.join(root, 'images', 'royal.svg');
const outPath = path.join(root, 'images', 'royal-16.png');

async function convert() {
  if (!fs.existsSync(svgPath)) {
    console.error('SVG not found:', svgPath);
    process.exit(2);
  }

  try {
    await sharp(svgPath)
      .resize(16, 16, { fit: 'contain' })
      .png({ compressionLevel: 9 })
      .toFile(outPath);

    console.log('Wrote', outPath);
  } catch (err) {
    console.error('Conversion failed:', err);
    process.exit(1);
  }
}

convert();
