export function imageDimensions(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && v.getUint32(0) === 0x89504e47) return { width: v.getUint32(16), height: v.getUint32(20) };
  if (bytes.length > 4 && v.getUint16(0) === 0xffd8) {
    let p = 2;
    while (p + 9 < bytes.length) {
      if (bytes[p] !== 255) break;
      const marker = bytes[p + 1], size = v.getUint16(p + 2);
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) return { width: v.getUint16(p + 7), height: v.getUint16(p + 5) };
      if (size < 2) break; p += size + 2;
    }
  }
  if (bytes.length >= 30 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF") {
    const type = String.fromCharCode(...bytes.slice(12, 16));
    if (type === "VP8X") return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
    if (type === "VP8 ") return { width: v.getUint16(26, true) & 16383, height: v.getUint16(28, true) & 16383 };
    if (type === "VP8L") { const n = v.getUint32(21, true); return { width: (n & 16383) + 1, height: ((n >>> 14) & 16383) + 1 }; }
  }
  throw new Error("Не удалось определить размеры рисунка");
}
