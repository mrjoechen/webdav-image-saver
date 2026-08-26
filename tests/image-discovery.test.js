const assert = require('node:assert/strict');
const test = require('node:test');

const discovery = require('../image-discovery.js');

test('selects the largest width candidate and resolves relative URLs', () => {
  const result = discovery.selectBestCandidate({
    currentSrc: 'https://site.test/img/photo-640.jpg',
    src: '/img/photo.jpg',
    srcsets: ['/img/photo-640.jpg 640w, /img/photo-1600.jpg 1600w'],
    lazyUrls: []
  }, 'https://site.test/article');

  assert.deepEqual(result, {
    url: 'https://site.test/img/photo-1600.jpg',
    descriptorType: 'width',
    descriptorValue: 1600
  });
});

test('prefers the largest density when no width descriptors exist', () => {
  const result = discovery.selectBestCandidate({
    currentSrc: 'https://site.test/a.png',
    srcsets: ['https://site.test/a.png 1x, https://site.test/a@3x.png 3x'],
    lazyUrls: []
  }, 'https://site.test/');

  assert.deepEqual(result, {
    url: 'https://site.test/a@3x.png',
    descriptorType: 'density',
    descriptorValue: 3
  });
});

test('uses currentSrc before plain and lazy fallback URLs', () => {
  assert.equal(discovery.selectBestCandidate({
    currentSrc: '/rendered.jpg',
    src: '/plain.jpg',
    srcsets: [],
    lazyUrls: ['/lazy.jpg']
  }, 'https://site.test/post').url, 'https://site.test/rendered.jpg');

  assert.equal(discovery.selectBestCandidate({
    currentSrc: '',
    src: '/plain.jpg',
    srcsets: [],
    lazyUrls: ['/lazy.jpg']
  }, 'https://site.test/post').url, 'https://site.test/plain.jpg');
});

test('keeps query parameters, removes fragments, and rejects unsupported schemes', () => {
  assert.equal(
    discovery.normalizeUrl('/photo.jpg?w=1600#preview', 'https://site.test/post'),
    'https://site.test/photo.jpg?w=1600'
  );
  assert.equal(discovery.normalizeUrl('blob:https://site.test/id', 'https://site.test/'), '');
  assert.equal(discovery.normalizeUrl('data:image/png;base64,AA==', 'https://site.test/'), '');
  assert.equal(discovery.normalizeUrl('not a url', 'not a base'), '');
});

test('ignores invalid srcset descriptors without losing valid candidates', () => {
  assert.deepEqual(
    discovery.parseSrcset('/bad.jpg nope, /good.jpg 1280w, /also-bad.jpg 0w', 'https://site.test/'),
    [{ url: 'https://site.test/good.jpg', width: 1280, density: 0, order: 1 }]
  );
});

test('deduplicates exact selected URLs in stable DOM order', () => {
  const images = discovery.discoverImages([
    {
      currentSrc: '/same.jpg',
      domIndex: 3,
      naturalWidth: 1200,
      naturalHeight: 800,
      alt: 'First'
    },
    {
      currentSrc: '/other.jpg',
      domIndex: 5,
      naturalWidth: 900,
      naturalHeight: 600,
      alt: 'Other'
    },
    {
      currentSrc: '/same.jpg#copy',
      domIndex: 8,
      naturalWidth: 600,
      naturalHeight: 400,
      alt: 'Duplicate'
    }
  ], 'https://site.test/');

  assert.deepEqual(images, [
    {
      id: 'image-3',
      url: 'https://site.test/same.jpg',
      name: 'same.jpg',
      width: 1200,
      height: 800,
      alt: 'First',
      domIndex: 3
    },
    {
      id: 'image-5',
      url: 'https://site.test/other.jpg',
      name: 'other.jpg',
      width: 900,
      height: 600,
      alt: 'Other',
      domIndex: 5
    }
  ]);
});

test('uses a safe display name when a URL has no filename', () => {
  const images = discovery.discoverImages([
    { currentSrc: 'https://site.test/', domIndex: 0, naturalWidth: 1, naturalHeight: 1 }
  ], 'https://site.test/');

  assert.equal(images[0].name, 'image');
});

test('collects the active picture source, image srcsets, and lazy-loading candidates', () => {
  const attributes = new Map([
    ['src', '/fallback.jpg'],
    ['srcset', '/inline-800.jpg 800w, /inline-1200.jpg 1200w'],
    ['data-srcset', '/lazy-1400.jpg 1400w, /lazy-1800.jpg 1800w'],
    ['data-src', '/lazy.jpg'],
    ['data-original', '/original.jpg']
  ]);
  const sources = [
    { media: '(max-width: 799px)', type: 'image/jpeg', srcset: '/small-800.jpg 800w' },
    { media: '(min-width: 800px)', type: 'image/webp', srcset: '/wide-1600.webp 1600w' }
  ];
  const image = {
    currentSrc: 'https://site.test/wide-1600.webp',
    naturalWidth: 1600,
    naturalHeight: 900,
    alt: 'Hero',
    parentElement: { tagName: 'PICTURE', querySelectorAll: () => sources },
    getAttribute: name => attributes.get(name) || null
  };
  const documentLike = { images: [image], baseURI: 'https://site.test/post' };

  const records = discovery.collectImageRecords(
    documentLike,
    query => ({ matches: query === '(min-width: 800px)' })
  );

  assert.deepEqual(records, [{
    currentSrc: 'https://site.test/wide-1600.webp',
    src: '/fallback.jpg',
    srcsets: [
      '/wide-1600.webp 1600w',
      '/inline-800.jpg 800w, /inline-1200.jpg 1200w',
      '/lazy-1400.jpg 1400w, /lazy-1800.jpg 1800w'
    ],
    lazyUrls: ['/lazy.jpg', '/original.jpg'],
    naturalWidth: 1600,
    naturalHeight: 900,
    alt: 'Hero',
    domIndex: 0
  }]);
});
