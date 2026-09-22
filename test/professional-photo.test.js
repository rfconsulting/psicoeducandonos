const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_PHOTO_BYTES, photoMime } = require('../src/validation/professional-photo');

test('acepta solo firmas de imagen admitidas dentro del límite', () => {
  assert.equal(photoMime(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(16)])), 'image/png');
  assert.equal(photoMime(Buffer.concat([Buffer.from([255,216,255]), Buffer.alloc(16)])), 'image/jpeg');
  assert.equal(photoMime(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(4)])), 'image/webp');
  assert.equal(photoMime(Buffer.from('<svg onload="alert(1)"></svg>')), null);
  assert.equal(photoMime(Buffer.alloc(MAX_PHOTO_BYTES + 1)), null);
});
