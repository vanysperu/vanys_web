// Ancho y alto de una imagen PNG o JPEG leyendo su cabecera (sin dependencias).
const fs = require('fs');

function size(file) {
  const b = fs.readFileSync(file);
  if (b[0] === 0x89) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xFF) { i++; continue; }
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) {
      return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5), bytes: b.length };
    }
    i += 2 + len;
  }
  return { w: 0, h: 0, bytes: b.length };
}

module.exports = size;
