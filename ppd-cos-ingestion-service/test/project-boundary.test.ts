import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const forbiddenRuntime = /ppd-google-chat-cos-adapter|ppd-pmt|cockpit/i;
const moduleSpecifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\(\s*)['"]([^'"]+)['"]/g;

function findTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return findTypeScriptFiles(entryPath);
    }

    return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}

test('the ingestion service remains a standalone project', () => {
  assert.equal(path.basename(projectRoot), 'ppd-cos-ingestion-service');

  const sourceDirectory = path.join(projectRoot, 'src');
  assert.ok(existsSync(sourceDirectory), 'expected the standalone src directory to exist');

  const sourceFiles = findTypeScriptFiles(sourceDirectory);
  assert.ok(sourceFiles.length > 0, 'expected at least one TypeScript source file');

  for (const sourceFile of sourceFiles) {
    const relativeSourceFile = path.relative(projectRoot, sourceFile);
    const source = readFileSync(sourceFile, 'utf8');
    for (const match of source.matchAll(moduleSpecifier)) {
      assert.doesNotMatch(
        match[1] ?? '',
        forbiddenRuntime,
        `forbidden runtime import found in ${relativeSourceFile}`,
      );
    }
  }

  assert.equal(
    existsSync(path.join(projectRoot, 'data')),
    false,
    'the ingestion service must not own Chief-of-Staff shared state',
  );
});
