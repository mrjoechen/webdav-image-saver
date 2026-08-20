const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const rules = require('../directory-rule.js');

test('exports frozen rules and normalizes rule and folder values', () => {
    assert.deepEqual(rules.DIRECTORY_RULES, ['fixed', 'date', 'domain', 'domain-date']);
    assert.equal(Object.isFrozen(rules.DIRECTORY_RULES), true);
    assert.equal(rules.normalizeDirectoryRule('date'), 'date');
    assert.equal(rules.normalizeDirectoryRule('bogus'), 'fixed');
    assert.equal(rules.normalizeFolder(''), '/');
    assert.equal(rules.normalizeFolder(' Photos///'), '/Photos');
    assert.equal(rules.normalizeFolder('/A//B/'), '/A/B');
    assert.equal(rules.normalizeFolder('/'), '/');
});

test('fixed rule uses arbitrary normalized root and creates no folders', () => {
    assert.deepEqual(rules.resolveDirectory({ rule: 'fixed', rootFolder: '/Photos', pageUrl: 'https://example.com' }), { folder: '/Photos', foldersToCreate: [] });
    assert.deepEqual(rules.resolveDirectory({ rule: 'fixed', rootFolder: '/', pageUrl: 'https://example.com' }), { folder: '/', foldersToCreate: [] });
});

test('date rule appends local year and zero-padded month parent-first', () => {
    const now = new Date(2026, 7, 20, 12);
    assert.deepEqual(rules.resolveDirectory({ rule: 'date', rootFolder: '/Photos', pageUrl: 'https://example.com', now }), { folder: '/Photos/2026/08', foldersToCreate: ['/Photos/2026', '/Photos/2026/08'] });
    assert.equal(rules.resolveDirectory({ rule: 'date', rootFolder: '/', pageUrl: 'https://example.com', now: new Date(2026, 0, 1) }).folder, '/2026/01');
});

test('domain rule strips only leading www and preserves subdomains', () => {
    assert.equal(rules.resolveDirectory({ rule: 'domain', rootFolder: '/Photos', pageUrl: 'https://www.example.com/a' }).folder, '/Photos/example.com');
    assert.equal(rules.resolveDirectory({ rule: 'domain', rootFolder: '/Photos', pageUrl: 'https://docs.example.com/a' }).folder, '/Photos/docs.example.com');
});

test('domain-date rule appends domain then date with parent-first folders', () => {
    assert.deepEqual(rules.resolveDirectory({ rule: 'domain-date', rootFolder: '/', pageUrl: 'https://www.example.com', now: new Date(2026, 7, 20) }), { folder: '/example.com/2026/08', foldersToCreate: ['/example.com', '/example.com/2026', '/example.com/2026/08'] });
});

test('invalid and hostname-less URLs use unknown-site', () => {
    for (const pageUrl of ['not a url', 'file:///tmp/image.png']) {
        assert.equal(rules.resolveDirectory({ rule: 'domain', rootFolder: '/Photos', pageUrl }).folder, '/Photos/unknown-site');
    }
});

test('sanitizeDirectorySegment makes dynamic values safe and non-hierarchical', () => {
    const fallback = 'unknown-site';
    for (const value of ['.', '..', '../secret', 'a/b', 'a\\b', 'a\0b', 'a\u007fb', '   ...  ', '\ud800']) {
        const result = rules.sanitizeDirectorySegment(value, fallback);
        assert.ok(result && result !== '.' && result !== '..');
        assert.equal(/[\\/]/.test(result), false);
        assert.equal(/[\u0000-\u001f\u007f<>:"|?*]/.test(result), false);
        assert.equal(result, result.normalize('NFC'));
        assert.equal(/[. ]$/.test(result), false);
    }
    assert.equal(rules.sanitizeDirectorySegment('', fallback), fallback);
    assert.equal(rules.sanitizeDirectorySegment('café', fallback), 'café');
    const malformed = rules.sanitizeDirectorySegment('bad\ud800segment', fallback);
    assert.doesNotThrow(() => encodeURIComponent(malformed));
    assert.equal(malformed.includes('\uFFFD'), true);
    const malformedFolder = rules.resolveDirectory({ rule: 'domain', rootFolder: '/Photos', pageUrl: 'https://bad\ud800.example' }).folder;
    assert.doesNotThrow(() => encodeURIComponent(malformedFolder));
    assert.equal(rules.resolveDirectory({ rule: 'domain', rootFolder: '/Photos', pageUrl: 'https://example.com/a/b' }).folder.split('/').length, 3);
});

test('rejects an explicitly invalid upload date', () => {
    assert.throws(() => rules.resolveDirectory({ rule: 'date', rootFolder: '/', pageUrl: 'https://example.com', now: new Date(NaN) }), { name: 'TypeError', message: 'A valid upload date is required.' });
});

test('UMD module exposes DirectoryRule in a browser-like context', () => {
    const context = { console };
    context.globalThis = context;
    vm.runInNewContext(fs.readFileSync(require.resolve('../directory-rule.js'), 'utf8'), context);
    assert.deepEqual(Array.from(context.DirectoryRule.DIRECTORY_RULES), ['fixed', 'date', 'domain', 'domain-date']);
    assert.equal(typeof context.DirectoryRule.resolveDirectory, 'function');
});

test('date rollover remains local and month padded', () => {
    assert.equal(rules.resolveDirectory({ rule: 'date', rootFolder: '/A/B/', pageUrl: 'https://example.com', now: new Date(2025, 11, 31, 23, 59) }).folder, '/A/B/2025/12');
    assert.equal(rules.resolveDirectory({ rule: 'date', rootFolder: '/A/B/', pageUrl: 'https://example.com', now: new Date(2026, 0, 1) }).folder, '/A/B/2026/01');
});
