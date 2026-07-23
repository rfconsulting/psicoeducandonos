const fs = require('node:fs');
const path = require('node:path');

const ignored = new Set(['node_modules', '.git', '.env', 'server.out.log', 'server.err.log']);
const findings = [];
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(target);
    else if (entry.isFile() && !/\.(png|jpe?g|gif|ico|lock)$/i.test(entry.name)) {
      const text = fs.readFileSync(target, 'utf8');
      text.split(/\r?\n/).forEach((line, index) => {
        if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(line)
          || /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9+/_=-]{20,}['"]/i.test(line)) {
          findings.push(`${target}:${index + 1}`);
        }
      });
    }
  }
}
visit('.');
if (findings.length) {
  console.error(`Posibles secretos encontrados (valores omitidos):\n${findings.join('\n')}`);
  process.exit(1);
}
console.log('No se detectaron patrones de secretos.');
