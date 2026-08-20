const assert = require('node:assert/strict');
const test = require('node:test');

const {
  FORMAT_PREFERENCES,
  extensionForMimeType,
  isAnimatedImage,
  normalizeFormatPreference,
  prepareImageForUpload,
  replaceFilenameExtension
} = require('../image-format.js');

function gifImageBlock() {
  return [
    0x2c,
    0x00, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x01, 0x00,
    0x00,
    0x02,
    0x02, 0x44, 0x01,
    0x00
  ];
}

function gifBytes(frameCount) {
  const header = [
    ...Buffer.from('GIF89a', 'ascii'),
    0x01, 0x00, 0x01, 0x00,
    0x00, 0x00, 0x00
  ];
  const frames = Array.from({ length: frameCount }, gifImageBlock).flat();
  return Uint8Array.from([...header, ...frames, 0x3b]);
}

function pngChunk(type, data = []) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return [...length, ...Buffer.from(type, 'ascii'), ...data, 0x00, 0x00, 0x00, 0x00];
}

function pngBytes(animated) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const chunks = animated ? pngChunk('acTL', new Array(8).fill(0)) : pngChunk('IEND');
  return Uint8Array.from([...signature, ...chunks]);
}

function webpBytes(animated) {
  const chunkType = animated ? 'ANIM' : 'VP8 ';
  const chunkData = [0x00, 0x00, 0x00, 0x00];
  const riffSize = 4 + 8 + chunkData.length;
  const size = Buffer.alloc(4);
  size.writeUInt32LE(riffSize);
  const chunkSize = Buffer.alloc(4);
  chunkSize.writeUInt32LE(chunkData.length);
  return Uint8Array.from([
    ...Buffer.from('RIFF', 'ascii'),
    ...size,
    ...Buffer.from('WEBP', 'ascii'),
    ...Buffer.from(chunkType, 'ascii'),
    ...chunkSize,
    ...chunkData
  ]);
}

function createConversionHarness(encodedType) {
  const context = {
    drawImageArgs: null,
    fillRectArgs: null,
    fillStyle: '',
    drawImage(...args) {
      this.drawImageArgs = args;
    },
    fillRect(...args) {
      this.fillRectArgs = args;
    }
  };
  const canvases = [];

  class FakeOffscreenCanvas {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.convertOptions = null;
      canvases.push(this);
    }

    getContext(type) {
      assert.equal(type, '2d');
      return context;
    }

    async convertToBlob(options) {
      this.convertOptions = options;
      return new Blob(['encoded'], { type: encodedType || options.type });
    }
  }

  const bitmap = {
    width: 3,
    height: 2,
    closed: false,
    close() {
      this.closed = true;
    }
  };

  return {
    bitmap,
    canvases,
    context,
    createImageBitmapImpl: async () => bitmap,
    OffscreenCanvasImpl: FakeOffscreenCanvas
  };
}

test('normalizes supported image format preferences and defaults to original', () => {
  assert.deepEqual(FORMAT_PREFERENCES, ['original', 'ask', 'png', 'jpg', 'webp']);
  assert.equal(normalizeFormatPreference(), 'original');
  assert.equal(normalizeFormatPreference('invalid'), 'original');
  assert.equal(normalizeFormatPreference('webp'), 'webp');
});

test('maps MIME types and fallback extensions to safe file extensions', () => {
  assert.equal(extensionForMimeType('image/jpeg', 'png'), 'jpg');
  assert.equal(extensionForMimeType('image/png', 'jpg'), 'png');
  assert.equal(extensionForMimeType('', 'GIF'), 'gif');
  assert.equal(extensionForMimeType('', 'svg?download=1'), 'bin');
});

test('maps both standard icon MIME aliases to the actual ICO extension', async () => {
  for (const mimeType of ['image/x-icon', 'image/vnd.microsoft.icon']) {
    assert.equal(extensionForMimeType(mimeType, 'png'), 'ico');

    const sourceBlob = new Blob(['ico'], { type: mimeType });
    const result = await prepareImageForUpload({
      blob: sourceBlob,
      filename: 'favicon.png',
      targetFormat: 'original'
    });

    assert.equal(result.blob, sourceBlob);
    assert.equal(result.filename, 'favicon.ico');
    assert.equal(result.mimeType, mimeType);
  }
});

test('uses the actual extension for safe unmapped image MIME types', async () => {
  assert.equal(extensionForMimeType('image/avif', 'png'), 'avif');
  assert.equal(extensionForMimeType('image/svg+xml', 'png'), 'svg');
  assert.equal(extensionForMimeType('application/octet-stream', 'png'), 'png');

  const avifBlob = new Blob(['avif'], { type: 'image/avif' });
  const avifResult = await prepareImageForUpload({
    blob: avifBlob,
    filename: 'photo.png',
    targetFormat: 'original'
  });
  assert.equal(avifResult.filename, 'photo.avif');

  const svgBlob = new Blob(['<svg/>'], { type: 'image/svg+xml' });
  const svgResult = await prepareImageForUpload({
    blob: svgBlob,
    filename: 'logo.png',
    targetFormat: 'original'
  });
  assert.equal(svgResult.filename, 'logo.svg');
});

test('replaces only the final filename extension', () => {
  assert.equal(replaceFilenameExtension('image.example.png', 'webp'), 'image.example.webp');
  assert.equal(replaceFilenameExtension('image', 'jpg'), 'image.jpg');
});

test('detects animated GIF files without treating a single frame as animated', () => {
  assert.equal(isAnimatedImage(gifBytes(2), 'image/gif'), true);
  assert.equal(isAnimatedImage(gifBytes(1), 'image/gif'), false);
});

test('detects APNG animation chunks only in valid PNG containers', () => {
  assert.equal(isAnimatedImage(pngBytes(true), 'image/png'), true);
  assert.equal(isAnimatedImage(pngBytes(false), 'image/png'), false);
  assert.equal(isAnimatedImage(Buffer.from('acTL'), 'image/png'), false);
});

test('detects animation chunks only in valid WebP containers', () => {
  assert.equal(isAnimatedImage(webpBytes(true), 'image/webp'), true);
  assert.equal(isAnimatedImage(webpBytes(false), 'image/webp'), false);
  assert.equal(isAnimatedImage(Buffer.from('ANIM'), 'image/webp'), false);
});

test('reuses the source Blob for original and matching target formats', async () => {
  const sourceBlob = new Blob(['source'], { type: 'image/png' });
  const originalResult = await prepareImageForUpload({
    blob: sourceBlob,
    filename: 'photo.png',
    targetFormat: 'original'
  });
  const matchingResult = await prepareImageForUpload({
    blob: sourceBlob,
    filename: 'photo.png',
    targetFormat: 'png'
  });

  assert.equal(originalResult.blob, sourceBlob);
  assert.equal(matchingResult.blob, sourceBlob);
  assert.equal(originalResult.warningCode, null);
  assert.equal(matchingResult.warningCode, null);
});

test('converts to JPEG with quality, a white background, and a matching filename', async () => {
  const harness = createConversionHarness();
  const sourceBlob = new Blob(['source'], { type: 'image/png' });
  const result = await prepareImageForUpload({
    blob: sourceBlob,
    filename: 'photo.png',
    targetFormat: 'jpg',
    createImageBitmapImpl: harness.createImageBitmapImpl,
    OffscreenCanvasImpl: harness.OffscreenCanvasImpl
  });

  assert.equal(result.mimeType, 'image/jpeg');
  assert.equal(result.filename, 'photo.jpg');
  assert.deepEqual(harness.canvases[0].convertOptions, { type: 'image/jpeg', quality: 0.92 });
  assert.equal(harness.context.fillStyle, '#ffffff');
  assert.deepEqual(harness.context.fillRectArgs, [0, 0, 3, 2]);
  assert.equal(harness.bitmap.closed, true);
});

test('uses lossless PNG options and quality for WebP', async () => {
  const pngHarness = createConversionHarness();
  const webpHarness = createConversionHarness();
  const jpegBlob = new Blob(['source'], { type: 'image/jpeg' });

  await prepareImageForUpload({
    blob: jpegBlob,
    filename: 'photo.jpg',
    targetFormat: 'png',
    createImageBitmapImpl: pngHarness.createImageBitmapImpl,
    OffscreenCanvasImpl: pngHarness.OffscreenCanvasImpl
  });
  await prepareImageForUpload({
    blob: jpegBlob,
    filename: 'photo.jpg',
    targetFormat: 'webp',
    createImageBitmapImpl: webpHarness.createImageBitmapImpl,
    OffscreenCanvasImpl: webpHarness.OffscreenCanvasImpl
  });

  assert.deepEqual(pngHarness.canvases[0].convertOptions, { type: 'image/png' });
  assert.deepEqual(webpHarness.canvases[0].convertOptions, { type: 'image/webp', quality: 0.92 });
});

test('keeps animated images unchanged and reports a warning', async () => {
  const animatedBlob = new Blob([gifBytes(2)], { type: 'image/gif' });
  const result = await prepareImageForUpload({
    blob: animatedBlob,
    filename: 'animation.gif',
    targetFormat: 'png',
    createImageBitmapImpl: async () => {
      throw new Error('animated images must not be decoded');
    }
  });

  assert.equal(result.blob, animatedBlob);
  assert.equal(result.filename, 'animation.gif');
  assert.equal(result.mimeType, 'image/gif');
  assert.equal(result.warningCode, 'animated-image');
});

test('falls back to the original image when conversion fails or returns the wrong type', async () => {
  const sourceBlob = new Blob(['source'], { type: 'image/png' });
  const failedResult = await prepareImageForUpload({
    blob: sourceBlob,
    filename: 'photo.png',
    targetFormat: 'webp',
    createImageBitmapImpl: async () => {
      throw new Error('decoder unavailable');
    }
  });
  const wrongTypeHarness = createConversionHarness('image/png');
  const wrongTypeResult = await prepareImageForUpload({
    blob: sourceBlob,
    filename: 'photo.png',
    targetFormat: 'jpg',
    createImageBitmapImpl: wrongTypeHarness.createImageBitmapImpl,
    OffscreenCanvasImpl: wrongTypeHarness.OffscreenCanvasImpl
  });

  assert.equal(failedResult.blob, sourceBlob);
  assert.equal(failedResult.filename, 'photo.png');
  assert.equal(failedResult.warningCode, 'conversion-failed');
  assert.equal(wrongTypeResult.blob, sourceBlob);
  assert.equal(wrongTypeResult.warningCode, 'conversion-failed');
  assert.equal(wrongTypeHarness.bitmap.closed, true);
});

test('sniffs the real format when the response MIME type is missing', async () => {
  const animatedBlob = new Blob([gifBytes(2)]);
  const result = await prepareImageForUpload({
    blob: animatedBlob,
    filename: 'download.bin',
    targetFormat: 'png'
  });

  assert.equal(result.blob, animatedBlob);
  assert.equal(result.filename, 'download.gif');
  assert.equal(result.mimeType, 'image/gif');
  assert.equal(result.warningCode, 'animated-image');
});

test('aligns original filenames and MIME types with detected image bytes', async () => {
  const pngBlob = new Blob([pngBytes(false)], { type: 'application/octet-stream' });
  const result = await prepareImageForUpload({
    blob: pngBlob,
    filename: 'photo.jpg',
    targetFormat: 'original'
  });

  assert.equal(result.blob, pngBlob);
  assert.equal(result.filename, 'photo.png');
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.warningCode, null);
});

test('requires a concrete target before preparing an ask-every-time upload', async () => {
  const sourceBlob = new Blob(['source'], { type: 'image/png' });

  await assert.rejects(
    prepareImageForUpload({
      blob: sourceBlob,
      filename: 'photo.png',
      targetFormat: 'ask'
    }),
    /concrete image format/i
  );
});
