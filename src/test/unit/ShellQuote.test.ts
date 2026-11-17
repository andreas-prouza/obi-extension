import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { sh_quote, is_valid_source_path, assert_valid_source_path, mkdir_parents_commands } from '../../shared/ShellQuote';


const TRICKY_VALUES = ['abc', 'a b', "it's", '$(id)', '`id`', 'a;b', "''", 'a"b', '$HOME', '~/x', 'a\\b', ''];


suite('ShellQuote', () => {

  test('sh_quote wraps in single quotes and escapes single quotes', () => {
    assert.strictEqual(sh_quote('abc'), "'abc'");
    assert.strictEqual(sh_quote("it's"), `'it'\\''s'`);
    assert.strictEqual(sh_quote(''), "''");
  });


  test('sh_quote round-trip through sh: every value stays one literal word', function () {
    if (process.platform === 'win32')
      this.skip();

    for (const value of TRICKY_VALUES) {
      const output = execFileSync('sh', ['-c', `printf '%s' ${sh_quote(value)}`], { encoding: 'utf8' });
      assert.strictEqual(output, value, `value: ${value}`);
    }
  });


  test('remote command layer: bash -c <quoted command> keeps inner quotes (path with space)', function () {
    if (process.platform === 'win32')
      this.skip();

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obi quote '));
    try {
      // Same composition as SSH_Tasks.get_finalized_command(`cd ${sh_quote(dir)} && pwd`)
      const inner = `cd ${sh_quote(dir)} && pwd`;
      const output = execFileSync('sh', ['-c', `bash -c ${sh_quote(inner)}`], { encoding: 'utf8' }).trim();
      assert.strictEqual(fs.realpathSync(output), fs.realpathSync(dir));
    }
    finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });


  test('remote command layer: command substitution in a value is not executed', function () {
    if (process.platform === 'win32')
      this.skip();

    const inner = `printf '%s' ${sh_quote('--source=$(echo injected)')}`;
    const output = execFileSync('sh', ['-c', `bash -c ${sh_quote(inner)}`], { encoding: 'utf8' });
    assert.strictEqual(output, '--source=$(echo injected)');
  });


  test('is_valid_source_path accepts IBM i source names', () => {
    for (const source of ['lib/qrpglesrc/a.rpgle.pgm', 'prouzalib/qrpglesrc/a$b#1@x.rpgle.pgm', 'lib/qddssrc/file_1.pf.file', 'lib/qrpglesrc/my-pgm.rpgle.pgm'])
      assert.ok(is_valid_source_path(source), source);
  });


  test('is_valid_source_path rejects shell metacharacters, spaces and ..', () => {
    for (const source of ["x';id;'", 'a b', '../x', 'lib/../../etc', '$(id)', '`id`', 'a;b', 'a|b', 'a&b', 'a\nb', ''])
      assert.ok(!is_valid_source_path(source), JSON.stringify(source));
  });


  test('assert_valid_source_path throws with the source name in the message', () => {
    assert.throws(() => assert_valid_source_path('a b'), /'a b'/);
    assert.doesNotThrow(() => assert_valid_source_path('lib/qrpglesrc/a.rpgle.pgm'));
  });


  test('mkdir_parents_commands: each folder once, only the deepest ones', () => {
    const files = [
      'proj/src/ccsrc/qcpysrc/a.rpgle.cpy',
      'proj/src/ccsrc/qcpysrc/b.rpgle.cpy',
      'proj/src/aasrc/qrpglesrc/c.rpgle.cpy',
      'proj/src/aasrc/d.txt',
      'proj/.obi/etc/constants.py',
      'proj/app-config.toml',
    ];
    assert.deepStrictEqual(mkdir_parents_commands(files),
      [`mkdir -p -- 'proj/.obi/etc' 'proj/src/aasrc/qrpglesrc' 'proj/src/ccsrc/qcpysrc'`]);
  });


  test('mkdir_parents_commands: backslashes, files without a folder, quoting, chunks', () => {
    assert.deepStrictEqual(mkdir_parents_commands(['a\\b\\c.txt', 'x.txt', '/y.txt']), [`mkdir -p -- 'a/b'`]);
    assert.deepStrictEqual(mkdir_parents_commands([`it's/$(id)/f`]), [`mkdir -p -- 'it'\\''s/$(id)'`]);
    assert.deepStrictEqual(mkdir_parents_commands(['a/f', 'b/f', 'c/f'], 2), [`mkdir -p -- 'a' 'b'`, `mkdir -p -- 'c'`]);
    assert.deepStrictEqual(mkdir_parents_commands([]), []);
  });


  test('mkdir_parents_commands: the command creates the folders in sh', function () {
    if (process.platform === 'win32')
      this.skip();

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obi mkdir '));
    try {
      for (const command of mkdir_parents_commands(['a b/c/f.txt', `it's/x/f.txt`, 'a b/d/f.txt']))
        execFileSync('sh', ['-c', `bash -c ${sh_quote(command)}`], { cwd: dir });
      for (const created of ['a b/c', 'a b/d', `it's/x`])
        assert.ok(fs.statSync(path.join(dir, created)).isDirectory(), created);
    }
    finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
