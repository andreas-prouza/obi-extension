#!/usr/bin/env node
// Static repository checks for CI (`npm run check:repo`). Exits with 1 and lists every finding.
// Further checks are added by their specs (see docs/features/continuous-integration.md).
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const findings = [];


function ts_files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === 'test' ? [] : ts_files(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}


function read_json(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}


// Commands are disposed with the extension only if registered through register_command (Registration.ts)
function check_command_registration() {
  for (const file of ts_files(SRC)) {
    if (path.basename(file) === 'Registration.ts')
      continue;
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (/registerCommand\(/.test(line) && !/^\s*(\/\/|\/?\*)/.test(line))
        findings.push(`${path.relative(ROOT, file)}:${index + 1}: use register_command() instead of vscode.commands.registerCommand()`);
      // The logger knows the log level and hides secret* values; page scripts have no logger
      if (/console\.log\(/.test(line) && !/^\s*(\/\/|\/?\*)/.test(line) && !file.endsWith('Logger.ts') && !file.includes(`${path.sep}test${path.sep}`))
        findings.push(`${path.relative(ROOT, file)}:${index + 1}: use the logger instead of console.log`);
      if (/workspaceFolders(\?\.)?\[0\]/.test(line) && !file.endsWith('ObiFolder.ts'))
        findings.push(`${path.relative(ROOT, file)}:${index + 1}: use Workspace instead of workspaceFolders[0], the OBI project can be in any folder`);
    });
  }
}


// Dependencies must not float: "latest" or "*" can resolve to a different (or compromised) version on every install
// Import cycles make the load order of modules fragile. The number of modules in cycles may only go down.
const MODULES_IN_CYCLES = 16;

function check_import_cycles() {
  const graph = new Map();
  for (const file of ts_files(SRC)) {
    if (file.includes(`${path.sep}test${path.sep}`) || file.includes(`${path.sep}javascript${path.sep}`))
      continue;
    const imports = [];
    // `import type` disappears at compile time and can't cause a cycle
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/^import (?!type )[^;'"]*['"](\.[^'"]+)['"]/gm)) {
      const target = path.resolve(path.dirname(file), `${match[1]}.ts`);
      if (fs.existsSync(target))
        imports.push(target);
    }
    graph.set(file, imports);
  }

  // Tarjan: strongly connected components with more than one module are cycles
  const index = new Map();
  const low = new Map();
  const stack = [];
  const on_stack = new Set();
  const components = [];
  let counter = 0;
  const visit = (node) => {
    index.set(node, counter);
    low.set(node, counter++);
    stack.push(node);
    on_stack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      }
      else if (on_stack.has(next))
        low.set(node, Math.min(low.get(node), index.get(next)));
    }
    if (low.get(node) === index.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        on_stack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1)
        components.push(component);
    }
  };
  for (const node of graph.keys())
    if (!index.has(node))
      visit(node);

  const modules = components.reduce((sum, component) => sum + component.length, 0);
  if (modules > MODULES_IN_CYCLES)
    findings.push(`Import cycles: ${modules} modules (maximum ${MODULES_IN_CYCLES}). Largest: ${components.sort((a, b) => b.length - a.length)[0].map(file => path.relative(SRC, file)).join(', ')}`);
  else if (modules < MODULES_IN_CYCLES)
    console.log(`check-repo: import cycles went down to ${modules} modules, lower MODULES_IN_CYCLES`);
}


function check_pinned_dependencies() {
  const pkg = read_json('package.json');
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, version] of Object.entries(pkg[section] || {})) {
      if (version === 'latest' || version === '*' || version === '')
        findings.push(`package.json: ${section}.${name} must have a version range, not "${version}"`);
    }
  }
}


// Every %key% in package.json needs a text in every language file
function check_nls_keys() {
  const keys = new Set();
  JSON.stringify(read_json('package.json')).replace(/"%([^%"]+)%"/g, (_, key) => { keys.add(key); return ''; });

  const nls_files = fs.readdirSync(ROOT).filter(file => /^package\.nls(\.[a-z-]+)?\.json$/.test(file));
  for (const file of nls_files) {
    const texts = read_json(file);
    for (const key of keys) {
      if (typeof texts[key] !== 'string' || texts[key] === '')
        findings.push(`${file}: missing text for "%${key}%" (used in package.json)`);
    }
  }
}


// Webviews: every page sets the Content-Security-Policy, and no template contains inline code it would block
function check_templates() {
  const template_dir = path.join(ROOT, 'asserts', 'templates');
  const html_files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? html_files(path.join(dir, entry.name)) : entry.name.endsWith('.html') ? [path.join(dir, entry.name)] : []);

  for (const file of html_files(template_dir)) {
    const rel = path.relative(ROOT, file);
    const html = fs.readFileSync(file, 'utf8');

    if (/<head[\s>]/.test(html) && !html.includes('{% include "tools/csp.html" %}') && !/http-equiv="Content-Security-Policy"/.test(html))
      findings.push(`${rel}: page template without {% include "tools/csp.html" %}`);

    // Tags can span several lines: search the whole file
    const line_of = index => html.slice(0, index).split('\n').length;
    const rules = [
      [/<script(?![^>]*\ssrc=)[^>]*>/g, 'inline <script> (blocked by the CSP; move the code into the page module)'],
      [/<[a-z][^>]*?\son[a-z]+\s*=/gi, 'inline event handler attribute (blocked by the CSP; use addEventListener)'],
      [/href\s*=\s*["']\s*javascript:/gi, 'javascript: link'],
    ];
    for (const [pattern, message] of rules) {
      for (const match of html.matchAll(pattern))
        findings.push(`${rel}:${line_of(match.index)}: ${message}`);
    }
  }
}


// Runtime texts (vscode.l10n): every template text and every vscode.l10n.t('…') literal has a German translation
function check_l10n() {
  const de = read_json('l10n/bundle.l10n.de.json');
  const en = read_json('l10n/bundle.l10n.json');
  const ids_source = fs.readFileSync(path.join(SRC, 'extension/utilities/TemplateTexts.ts'), 'utf8');
  const ids_literal = ids_source.slice(ids_source.indexOf('{', ids_source.indexOf('TEXT_IDS')), ids_source.indexOf('};') + 1);
  const ids = JSON.parse(ids_literal.replace(/,\s*}$/, '}'));

  const required = new Map();   // text -> where it is used
  const template_dir = path.join(ROOT, 'asserts', 'templates');
  const html_files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? html_files(path.join(dir, entry.name)) : entry.name.endsWith('.html') ? [path.join(dir, entry.name)] : []);
  for (const file of html_files(template_dir)) {
    const html = fs.readFileSync(file, 'utf8');
    for (const match of html.matchAll(/get_text'\]\((?:'([^']*)'|"([^"]*)")\)/g)) {
      const key = match[1] ?? match[2];
      required.set(ids[key] ?? key, path.relative(ROOT, file));
    }
  }
  for (const file of ts_files(SRC)) {
    const code = fs.readFileSync(file, 'utf8');
    for (const match of code.matchAll(/l10n\.t\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g)) {
      const literal = match[1] ?? match[2] ?? match[3];
      required.set(JSON.parse(`"${literal.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`), path.relative(ROOT, file));
    }
  }

  for (const [text, where] of required) {
    if (typeof de[text] !== 'string' || de[text] === '')
      findings.push(`l10n/bundle.l10n.de.json: missing German text for ${JSON.stringify(text)} (${where})`);
    if (!(text in en))
      findings.push(`l10n/bundle.l10n.json: missing ${JSON.stringify(text)} (${where})`);
  }
}


check_command_registration();
check_templates();
check_l10n();
check_import_cycles();
check_pinned_dependencies();
check_nls_keys();

if (findings.length) {
  console.error(findings.join('\n'));
  console.error(`\ncheck-repo: ${findings.length} finding(s)`);
  process.exit(1);
}
console.log('check-repo: ok');
