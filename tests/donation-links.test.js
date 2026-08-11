const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const optionsHtml = readFileSync(path.join(projectRoot, 'options/options.html'), 'utf8');
const kofiUrl = 'https://ko-fi.com/joechen';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findAnchorBlock(source, href) {
  const escapedHref = escapeRegExp(href);
  return source.match(new RegExp(`<a\\b[^>]*href="${escapedHref}"[^>]*>[\\s\\S]*?<\\/a>`, 'i'))?.[0] || '';
}

test('settings header exposes a secure and accessible Ko-fi coffee icon link', () => {
  const anchorBlock = findAnchorBlock(optionsHtml, kofiUrl);
  const openingTag = anchorBlock.match(/^<a\b[^>]*>/i)?.[0] || '';
  const rel = openingTag.match(/\brel="([^"]*)"/i)?.[1] || '';

  assert.match(optionsHtml, /<symbol id="icon-coffee" viewBox="0 0 24 24">[\s\S]*?<\/symbol>/);
  assert.notEqual(anchorBlock, '', 'Ko-fi anchor should exist');
  assert.match(openingTag, /\bclass="[^"]*\bicon-button\b[^"]*"/);
  assert.match(openingTag, /\bclass="[^"]*\bdonation-link\b[^"]*"/);
  assert.match(openingTag, /\btarget="_blank"/);
  assert.deepEqual(new Set(rel.split(/\s+/).filter(Boolean)), new Set(['noopener', 'noreferrer']));
  assert.match(openingTag, /\baria-label="Support this project on Ko-fi"/);
  assert.match(openingTag, /\btitle="Support on Ko-fi"/);
  assert.match(anchorBlock, /<use href="#icon-coffee"><\/use>/);
});

test('English README links to Ko-fi with the support label', () => {
  const readme = readFileSync(path.join(projectRoot, 'README.md'), 'utf8');

  assert.match(
    readme,
    /^☕ \[Support this project on Ko-fi\]\(https:\/\/ko-fi\.com\/joechen\)$/m
  );
});

test('Chinese README links to Ko-fi with the localized support label', () => {
  const readme = readFileSync(path.join(projectRoot, 'README.zh-CN.md'), 'utf8');

  assert.match(
    readme,
    /^☕ \[在 Ko-fi 上支持这个项目\]\(https:\/\/ko-fi\.com\/joechen\)$/m
  );
});
