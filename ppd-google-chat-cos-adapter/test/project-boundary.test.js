const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('project is standalone and contains no runtime data store', () => {
  assert.equal(path.basename(root), 'ppd-google-chat-cos-adapter');
  assert.equal(fs.existsSync(path.join(root, 'src')), true);
  assert.equal(fs.existsSync(path.join(root, 'data')), false);
});
