const sharp = require('sharp');
const { writeFileSync, readFileSync } = require('fs');
const { join } = require('path');

const sizes = [16, 32, 48, 128];
const iconDir = join(__dirname, '../icons');
const svgPath = join(iconDir, 'icon.svg');

async function convert() {
  const svg = readFileSync(svgPath);

  for (const size of sizes) {
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(join(iconDir, `icon-${size}.png`));
    console.log(`Created icon-${size}.png`);
  }

  console.log('Done!');
}

convert().catch(console.error);