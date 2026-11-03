#!/usr/bin/env node
// Copies the front-end libraries the webviews use from node_modules to out/vendor (only the used files).
// The versions are in package.json, so npm audit and Dependabot see them.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'out', 'vendor');

// node_modules/<from> → out/vendor/<to>
const FILES = [
  ['jquery/dist/jquery.min.js', 'jquery/jquery.min.js'],
  ['bootstrap/dist/css/bootstrap.min.css', 'bootstrap/bootstrap.min.css'],
  ['bootstrap/dist/js/bootstrap.bundle.min.js', 'bootstrap/bootstrap.bundle.min.js'],
  ['bootstrap-table/dist/bootstrap-table.min.css', 'bootstrap-table/bootstrap-table.min.css'],
  ['bootstrap-table/dist/bootstrap-table.min.js', 'bootstrap-table/bootstrap-table.min.js'],
  ['bootstrap-table/dist/extensions/resizable/bootstrap-table-resizable.min.js', 'bootstrap-table/bootstrap-table-resizable.min.js'],
  ['bootstrap-table/dist/extensions/filter-control/bootstrap-table-filter-control.min.js', 'bootstrap-table/bootstrap-table-filter-control.min.js'],
  ['bootstrap-table/dist/locale/bootstrap-table-de-DE.min.js', 'bootstrap-table/bootstrap-table-de-DE.min.js'],
  ['bootstrap-table/dist/locale/bootstrap-table-en-US.min.js', 'bootstrap-table/bootstrap-table-en-US.min.js'],
  ['tom-select/dist/js/tom-select.complete.min.js', 'tom-select/tom-select.complete.min.js'],
  ['tom-select/dist/css/tom-select.min.css', 'tom-select/tom-select.min.css'],
  ['@vscode/codicons/dist/codicon.css', 'codicons/codicon.css'],
  ['@vscode/codicons/dist/codicon.ttf', 'codicons/codicon.ttf'],
];

fs.rmSync(TARGET, { recursive: true, force: true });
for (const [from, to] of FILES) {
  const target = path.join(TARGET, to);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'node_modules', from), target);
}
console.log(`copy-vendor: ${FILES.length} files → out/vendor`);
