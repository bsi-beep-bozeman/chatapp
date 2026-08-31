const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { scanProject } = require('./helpers/secret-scan');

const root = path.resolve(__dirname, '..');

function sourceText() {
  return fs.readdirSync(path.join(root, 'src'))
    .filter((name) => name.endsWith('.gs'))
    .sort()
    .map((name) => fs.readFileSync(path.join(root, 'src', name), 'utf8'))
    .join('\n');
}

test('repository contains no embedded credentials or live deployment endpoints', () => {
  const findings = scanProject(root, {
    ignored: ['node_modules', 'coverage'],
    patterns: [
      new RegExp(['-----BEGIN', 'PRIVATE KEY-----'].join(' ')),
      /AIza[0-9A-Za-z_-]{30,}/,
      /https:\/\/chat\.googleapis\.com\/v1\/spaces\/[A-Za-z0-9_-]+/,
      /https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+/,
      /QUEUE_HMAC_SECRET\s*[:=]\s*["'][^"'\r\n]{24,}["']/,
    ],
  });
  assert.deepEqual(findings, []);
});

test('production source has no Chief of Staff state writer or delete integration', () => {
  const source = sourceText();
  for (const forbidden of [
    /DriveApp\b/,
    /SpreadsheetApp\b/,
    /PropertiesService[^\n]*setPropert/,
    /\.delete\s*\(/,
    /\.remove\s*\(/,
    /UrlFetchApp[^\n]*(?:delete|patch)/i,
  ]) assert.doesNotMatch(source, forbidden);
});

test('production source never reads caller-supplied authorization claims', () => {
  const source = sourceText();
  for (const forbidden of [
    /\.canExecute\b/,
    /\.permissionFlags\b/,
    /\.permissions\b/,
    /\.displayName\b/,
    /event\.role\b/,
  ]) assert.doesNotMatch(source, forbidden);
});

test('deployment manifest excludes read, mutation, and delete scopes', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'appsscript.json'), 'utf8'));
  assert.deepEqual(manifest.oauthScopes, ['https://www.googleapis.com/auth/script.external_request']);
  const serialized = JSON.stringify(manifest);
  assert.equal(serialized.includes('drive'), false);
  assert.equal(serialized.includes('spreadsheets'), false);
  assert.equal(serialized.includes('chat.delete'), false);
  assert.equal(serialized.includes('chat.messages'), false);
});
