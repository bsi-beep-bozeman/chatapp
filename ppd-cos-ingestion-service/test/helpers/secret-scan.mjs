import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const textExtensions = new Set([
  '.js', '.json', '.md', '.mjs', '.sql', '.ts', '.yaml', '.yml', '.dockerignore',
]);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /AIza[0-9A-Za-z_-]{35}/,
  /https:\/\/chat\.googleapis\.com\/v1\/spaces\/[^/\s]+\/messages\?key=/,
  /(?:password|secret|token)\s*[:=]\s*['"][^'"]{12,}['"]/i,
];

function projectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignoredDirectories.has(entry.name)) return [];
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return projectFiles(entryPath);
    if (!entry.isFile()) return [];
    const extension = path.extname(entry.name);
    return textExtensions.has(extension) || entry.name === 'Dockerfile' ? [entryPath] : [];
  });
}

for (const file of projectFiles(root)) {
  if (file.endsWith('package-lock.json') || file.endsWith('secret-scan.mjs')) continue;
  const text = readFileSync(file, 'utf8');
  for (const pattern of patterns) {
    assert.doesNotMatch(text, pattern, path.relative(root, file));
  }
}

process.stdout.write('Secret scan passed.\n');
