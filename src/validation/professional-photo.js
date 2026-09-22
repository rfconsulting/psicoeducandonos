const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

function photoMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16 || buffer.length > MAX_PHOTO_BYTES) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

module.exports = { MAX_PHOTO_BYTES, photoMime };
