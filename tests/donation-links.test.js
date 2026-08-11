const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const optionsHtml = readFileSync(path.join(projectRoot, 'options/options.html'), 'utf8');
const kofiUrl = 'https://ko-fi.com/joechen';
const donationLogoPath = path.join(projectRoot, 'icons/kofi_logo.webp');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findAnchorBlock(source, href) {
  const escapedHref = escapeRegExp(href);
  return source.match(new RegExp(`<a\\b[^>]*href="${escapedHref}"[^>]*>[\\s\\S]*?<\\/a>`, 'i'))?.[0] || '';
}

function assertReadmeHasKofiBadge(readme) {
  assert.match(
    readme,
    /<a href="https:\/\/ko-fi\.com\/joechen"><img\b[^>]*\bsrc="https:\/\/img\.shields\.io\/badge\/ko--fi-[^"]*\blogo=ko-fi[^"]*"[^>]*\balt="ko-fi"[^>]*><\/a>/
  );
}

test('settings header exposes a secure and accessible Ko-fi logomark link', () => {
  const anchorBlock = findAnchorBlock(optionsHtml, kofiUrl);
  const openingTag = anchorBlock.match(/^<a\b[^>]*>/i)?.[0] || '';
  const rel = openingTag.match(/\brel="([^"]*)"/i)?.[1] || '';

  assert.notEqual(anchorBlock, '', 'Ko-fi anchor should exist');
  assert.match(openingTag, /\bclass="[^"]*\bicon-button\b[^"]*"/);
  assert.match(openingTag, /\bclass="[^"]*\bdonation-link\b[^"]*"/);
  assert.match(openingTag, /\btarget="_blank"/);
  assert.deepEqual(new Set(rel.split(/\s+/).filter(Boolean)), new Set(['noopener', 'noreferrer']));
  assert.match(openingTag, /\baria-label="Support this project on Ko-fi"/);
  assert.match(openingTag, /\btitle="Support on Ko-fi"/);
  assert.match(
    anchorBlock,
    /<img\b[^>]*\bclass="[^"]*\bdonation-logo\b[^"]*"[^>]*\bsrc="\.\.\/icons\/kofi_logo\.webp"[^>]*\balt=""[^>]*\baria-hidden="true"[^>]*>/
  );
  assert.equal(existsSync(donationLogoPath), true, 'Ko-fi logomark asset should be packaged');
});

test('English README links to Ko-fi with a badge', () => {
  const readme = readFileSync(path.join(projectRoot, 'README.md'), 'utf8');

  assertReadmeHasKofiBadge(readme);
});

test('Chinese README links to Ko-fi with a badge', () => {
  const readme = readFileSync(path.join(projectRoot, 'README.zh-CN.md'), 'utf8');

  assertReadmeHasKofiBadge(readme);
});
