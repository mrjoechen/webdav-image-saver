const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../filename-rule.js');

const now = new Date(2026, 7, 20, 14, 5, 9);

test('exports frozen rules, variables, and default template', () => {
    assert.deepEqual(rules.FILENAME_RULES, ['automatic', 'original', 'custom']);
    assert.ok(Object.isFrozen(rules.FILENAME_RULES));
    assert.deepEqual(rules.TEMPLATE_VARIABLES, ['originalName', 'date', 'time', 'domain', 'pageTitle', 'width', 'height', 'ext']);
    assert.ok(Array.isArray(rules.TEMPLATE_VARIABLES));
    assert.ok(Object.isFrozen(rules.TEMPLATE_VARIABLES));
    assert.equal(rules.DEFAULT_CUSTOM_TEMPLATE, '{originalName}_{date}_{domain}.{ext}');
});

test('normalizes and validates filename rules/templates', () => {
    assert.equal(rules.normalizeFilenameRule('custom'), 'custom');
    assert.equal(rules.normalizeFilenameRule('bad'), 'automatic');
    assert.deepEqual(rules.validateTemplate('  '), { valid: false, error: 'Template cannot be empty.' });
    assert.deepEqual(rules.validateTemplate('{foo}'), { valid: false, error: 'Unsupported template variable: foo.' });
    assert.deepEqual(rules.validateTemplate('{domain}.{ext}'), { valid: true, error: '' });
});

test('extracts safe source names and extensions', () => {
    assert.equal(rules.extractOriginalName('https://x/a/holiday.photo.png?x=1'), 'holiday.photo');
    assert.equal(rules.extractOriginalName('https://x/a/%E2%9C%93%20photo.jpeg'), '✓ photo');
    assert.equal(rules.extractOriginalName('https://x/a/one%2Ftwo.png'), 'one_two');
    assert.equal(rules.extractOriginalName('https://x/'), 'image');
    assert.equal(rules.extractOriginalName('not a url'), 'image');
    assert.equal(rules.extractSourceExtension('https://x/a/photo.JPEG#x'), 'jpeg');
    assert.equal(rules.extractSourceExtension('https://x/a/noext'), 'bin');
});

test('normalizes domains', () => {
    assert.equal(rules.normalizeDomain('https://www.example.com/path'), 'example.com');
    assert.equal(rules.normalizeDomain('https://www.cdn.example.com'), 'cdn.example.com');
    assert.equal(rules.normalizeDomain('https://example.com'), 'example.com');
    assert.equal(rules.normalizeDomain('bad'), 'unknown-site');
});

test('generates legacy automatic and original names', () => {
    assert.equal(rules.generateFilename({ rule: 'automatic', imageUrl: 'https://img/a.jpg', pageUrl: 'https://www.example.com/p', extension: 'jpg', now }), 'image_20260820140509_www_example_com.jpg');
    assert.equal(rules.generateFilename({ rule: 'original', imageUrl: 'https://x/holiday.photo.png', pageUrl: 'https://example.com', extension: 'jpg', now }), 'holiday.photo.jpg');
});

test('uses legacy timestamp fallback when either URL is invalid', () => {
    assert.equal(rules.generateFilename({ rule: 'automatic', imageUrl: 'invalid', pageUrl: 'https://example.com', extension: 'jpg', now }), `image_${now.getTime()}_fallback.jpg`);
    assert.equal(rules.generateFilename({ rule: 'automatic', imageUrl: 'https://x/a.jpg', pageUrl: 'invalid', extension: 'jpg', now }), `image_${now.getTime()}_fallback.jpg`);
});

test('expands custom variables and guarantees extension', () => {
    const args = { rule: 'custom', template: '{originalName}-{date}-{time}-{domain}-{pageTitle}-{width}x{height}.{ext}', imageUrl: 'https://x/photo.png', pageUrl: 'https://www.example.com', pageTitle: 'A page', width: 640, height: 480, extension: 'jpg', now };
    assert.equal(rules.generateFilename(args), 'photo-20260820-140509-example.com-A page-640x480.jpg');
    assert.equal(rules.generateFilename({ ...args, template: 'photo' }), 'photo.jpg');
    assert.equal(rules.generateFilename({ ...args, template: 'photo.png' }), 'photo.png.jpg');
});

test('sanitizes forbidden chars, device names, trailing punctuation, and byte length', () => {
    assert.equal(rules.sanitizeFilename('  CON.txt.  ', 'jpg', 'fallback.jpg'), '_CON.txt.jpg');
    assert.equal(rules.sanitizeFilename('a<>:"/\\|?*b', 'jpg', 'fallback.jpg'), 'a_________b.jpg');
    const result = rules.sanitizeFilename('😀'.repeat(200), 'jpg', 'fallback.jpg');
    assert.ok(Buffer.byteLength(result, 'utf8') <= 255);
    assert.match(result, /\.jpg$/);
    assert.equal(rules.sanitizeFilename('...', 'jpg', 'fallback.jpg'), 'fallback.jpg');
});

test('reads dimensions and closes bitmap, including failures', async () => {
    let closed = false;
    const bitmap = { width: 12, height: 34, close() { closed = true; } };
    assert.deepEqual(await rules.readImageDimensions({}, async () => bitmap), { width: 12, height: 34 });
    assert.equal(closed, true);
    assert.deepEqual(await rules.readImageDimensions({}, undefined), { width: 'unknown', height: 'unknown' });
    assert.deepEqual(await rules.readImageDimensions({}, async () => { throw new Error('bad'); }), { width: 'unknown', height: 'unknown' });
    assert.deepEqual(await rules.readImageDimensions({}, async () => ({ width: 1, height: 2, close() { throw new Error('close failed'); } })), { width: 1, height: 2 });
});

test('falls back to automatic for invalid custom output/template', () => {
    const args = { rule: 'custom', template: '{bad}', imageUrl: 'https://x/a.jpg', pageUrl: 'bad', extension: 'jpg', now };
    assert.equal(rules.generateFilename(args), `image_${now.getTime()}_fallback.jpg`);
    assert.equal(rules.generateFilename({ ...args, template: '***' }), `image_${now.getTime()}_fallback.jpg`);
    const pathological = rules.sanitizeFilename('...', 'jpg', ' '.repeat(400) + '...');
    assert.ok(pathological.endsWith('.jpg'));
    assert.ok(Buffer.byteLength(pathological, 'utf8') <= 255);
});
