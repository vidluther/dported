/**
 * Script to create placeholder PNG icons for the extension
 * Creates simple green square icons at 16, 48, and 128 pixel sizes
 */

const fs = require('fs');
const path = require('path');

// Simple PNG encoder for solid color images
function createPNG(size, r, g, b) {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // CRC32 table
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c >>> 0;
  }

  function crc32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function createChunk(type, data) {
    const typeBuffer = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);

    const crcData = Buffer.concat([typeBuffer, data]);
    const crcValue = crc32(crcData);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crcValue);

    return Buffer.concat([length, typeBuffer, data, crc]);
  }

  // IHDR chunk (image header)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);    // width
  ihdr.writeUInt32BE(size, 4);    // height
  ihdr[8] = 8;                     // bit depth
  ihdr[9] = 2;                     // color type (RGB)
  ihdr[10] = 0;                    // compression
  ihdr[11] = 0;                    // filter
  ihdr[12] = 0;                    // interlace
  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT chunk (image data)
  // Create raw pixel data with filter byte
  const rawData = [];
  for (let y = 0; y < size; y++) {
    rawData.push(0); // filter byte (none)
    for (let x = 0; x < size; x++) {
      rawData.push(r, g, b);
    }
  }

  // Compress using zlib (deflate)
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(rawData), { level: 9 });
  const idatChunk = createChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Create icons directory if it doesn't exist
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir);
}

// Create icons with a green color (#4ade80)
const sizes = [16, 48, 128];
const color = { r: 74, g: 222, b: 128 };

sizes.forEach(size => {
  const png = createPNG(size, color.r, color.g, color.b);
  const filename = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filename, png);
  console.log(`Created ${filename}`);
});

console.log('All icons created successfully!');
