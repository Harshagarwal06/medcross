#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

assert(!tracked.includes('config.js'), 'config.js must stay untracked because it can contain local API keys.');

const trackedTextFiles = tracked.filter(file => /\.(html|js|css|md|json|webmanifest)$/.test(file));
const secretPattern = /\b(AQ\.[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,})\b/;
const inlineHandlerPattern = /\son(?:click|load|error|submit|change)=/i;

for (const file of trackedTextFiles) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  assert(!secretPattern.test(text), `${file} appears to contain an API key.`);
  assert(!inlineHandlerPattern.test(text), `${file} contains an inline browser event handler.`);
}

const htmlAndCss = trackedTextFiles
  .filter(file => /\.(html|css|js)$/.test(file))
  .map(file => fs.readFileSync(path.join(root, file), 'utf8'))
  .join('\n');
const hasCdnDependency = /https:\/\/(cdn\.tailwindcss\.com|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)/.test(htmlAndCss);
if (hasCdnDependency) {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert(sw.includes('CACHEABLE_RESPONSE_TYPES'), 'CDN assets are present, so sw.js must cache cross-origin assets after first use.');
  assert(sw.includes('cors') && sw.includes('opaque'), 'sw.js should cache cors/opaque CDN responses for offline reuse.');
}

console.log(`Static security checks passed for ${trackedTextFiles.length} tracked text files.`);
