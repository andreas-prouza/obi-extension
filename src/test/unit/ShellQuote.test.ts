import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { sh_quote, is_valid_source_path, assert_valid_source_path } from '../../shared/ShellQuote';


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
});
