const fs = require('node:fs');
const path = require('node:path');

function scanProject(root, options = {}) {
  const ignored = new Set(options.ignored || []);
  const patterns = options.patterns || [];
  const findings = [];

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!/\.(?:gs|js|json|md)$/.test(entry.name)) continue;
      const content = fs.readFileSync(absolute, 'utf8');
      patterns.forEach((pattern, patternIndex) => {
        pattern.lastIndex = 0;
        if (pattern.test(content)) {
          findings.push({
            file: path.relative(root, absolute).replace(/\\/g, '/'),
            pattern: patternIndex,
          });
        }
      });
    }
  }

  walk(root);
  return findings.sort((left, right) => (
    left.file.localeCompare(right.file) || left.pattern - right.pattern
  ));
}

function defaultPatterns() {
  return [
    new RegExp(['-----BEGIN', 'PRIVATE KEY-----'].join(' ')),
    /AIza[0-9A-Za-z_-]{30,}/,
    /https:\/\/chat\.googleapis\.com\/v1\/spaces\/[A-Za-z0-9_-]+/,
    /https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+/,
    /QUEUE_HMAC_SECRET\s*[:=]\s*["'][^"'\r\n]{24,}["']/,
  ];
}

module.exports = { scanProject, defaultPatterns };

if (require.main === module) {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const findings = scanProject(projectRoot, {
    ignored: ['node_modules', 'coverage'],
    patterns: defaultPatterns(),
  });
  if (findings.length) {
    for (const finding of findings) {
      console.error(`${finding.file}: prohibited pattern ${finding.pattern}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Secret and live-endpoint scan clean.');
  }
}
