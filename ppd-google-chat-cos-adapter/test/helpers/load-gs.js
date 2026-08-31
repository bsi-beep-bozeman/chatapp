const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadGs(files, globals = {}) {
  const context = vm.createContext({ console, ...globals });
  for (const file of files) {
    const absolute = path.resolve(__dirname, '..', '..', 'src', file);
    vm.runInContext(fs.readFileSync(absolute, 'utf8'), context, { filename: absolute });
  }
  return context;
}

module.exports = { loadGs };
