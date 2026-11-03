#!/usr/bin/env node
// Fails if the VSIX would contain more files than allowed.
// Usage: npx vsce ls --no-dependencies > vsix-files.txt && node scripts/check-vsix-size.js vsix-files.txt
'use strict';

const fs = require('fs');

// The package has about 115 files (vsce ls --no-dependencies); more means something unintended got in.
const MAX_FILES = 150;

const list_file = process.argv[2];
if (!list_file) {
  console.error('Usage: node scripts/check-vsix-size.js <output of "vsce ls">');
  process.exit(2);
}

const files = fs.readFileSync(list_file, 'utf8').split(/\r?\n/).filter(line => line.trim() !== '');
console.log(`VSIX files: ${files.length} (maximum ${MAX_FILES})`);

if (files.length > MAX_FILES) {
  console.error(`The VSIX would contain ${files.length} files, more than ${MAX_FILES}. Check .vscodeignore.`);
  process.exit(1);
}
