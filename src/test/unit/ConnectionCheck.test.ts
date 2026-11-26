import assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { connection_check_script, parse_facts, path_has_open_source_packages, python_version_number, python_version_ok } from '../../shared/ConnectionCheck';


suite('Test connection: script and facts', () => {

  test('parse_facts: flags, texts, version; unknown and broken lines are ignored', () => {
    const facts = parse_facts('home=/home/MAX\nhome_exists=1\npath=/QOpenSys/pkgs/bin:/usr/bin\npython_exists=1\r\npython_version=Python 3.12.3\nbackend_version=5\nnoise\n=x\n');
    assert.deepStrictEqual(facts, {
      home: '/home/MAX', home_exists: true, bashrc: false, path: '/QOpenSys/pkgs/bin:/usr/bin', base_dir_exists: false,
      python_exists: true, python_version: 'Python 3.12.3', backend_file_exists: false, backend_version: 5
    });
    assert.strictEqual(parse_facts('backend_version=\n').backend_version, undefined);
    assert.strictEqual(parse_facts('').home, undefined);
  });

  test('Python version: 3.12 or newer', () => {
    assert.strictEqual(python_version_number('Python 3.12.3'), '3.12.3');
    assert.strictEqual(python_version_number('exec format error'), undefined);
    assert.ok(python_version_ok('3.12.0') && python_version_ok('3.13') && python_version_ok('4.0'));
    assert.ok(!python_version_ok('3.11.9') && !python_version_ok('2.7'));
  });

  test('PATH with the open source packages', () => {
    assert.ok(path_has_open_source_packages('/QOpenSys/pkgs/bin:/usr/bin'));
    assert.ok(path_has_open_source_packages('/usr/bin:/QOpenSys/pkgs/bin/'));
    assert.ok(!path_has_open_source_packages('/QOpenSys/pkgs/binx:/usr/bin'));
    assert.ok(!path_has_open_source_packages(undefined));
  });

  test('the script in bash: finds venv and version, quotes paths with blanks, changes nothing', function () {
    if (process.platform === 'win32')
      this.skip();   // the script is for PASE (bash); CI on Windows has no comparable shell
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-conn-'));
    try {
      const obi = path.join(root, 'obi dir');
      fs.mkdirSync(path.join(obi, 'venv', 'bin'), { recursive: true });
      fs.mkdirSync(path.join(obi, 'module'));
      fs.mkdirSync(path.join(root, 'project'));
      fs.writeFileSync(path.join(obi, 'venv', 'bin', 'python'), '#!/bin/sh\necho "Python 3.12.3"\n', { mode: 0o755 });
      fs.writeFileSync(path.join(obi, 'module', 'obi_constants.py'), 'class OBIConstants:\n    OBI_BACKEND_VERSION = 5   # comment\n');
      const before = fs.readdirSync(root, { recursive: true });

      const run = (base: string, dir: string) => parse_facts(execFileSync('bash', ['-c', connection_check_script(base, dir)], { encoding: 'utf8', env: { ...process.env, HOME: root } }));
      const facts = run(path.join(root, 'project'), obi);
      assert.ok(facts.home_exists && facts.base_dir_exists && facts.python_exists && facts.backend_file_exists);
      assert.strictEqual(facts.python_version, 'Python 3.12.3');
      assert.strictEqual(facts.backend_version, 5);

      const missing = run(path.join(root, 'nothing'), path.join(root, "it's missing"));
      assert.ok(!missing.base_dir_exists && !missing.python_exists && missing.backend_version === undefined);
      assert.deepStrictEqual(fs.readdirSync(root, { recursive: true }), before, 'nothing created');
    }
    finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
