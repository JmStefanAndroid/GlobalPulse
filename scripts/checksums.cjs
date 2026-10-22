const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { version } = require('../package.json');
const dir = path.join(__dirname, '../release');
const names = ['dmg', 'zip'].map(ext => `GlobalPulse-${version}-mac-x64.${ext}`);
const lines = names.map(name => `${createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex')}  ${name}`);
fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));