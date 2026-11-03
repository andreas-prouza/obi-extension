import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IQualifiedSource } from '../../shared/Source';
import { apply_source_filters, compile_filter, is_supported, to_qualified, walk_sources } from '../../extension/utilities/SourceInventory';


const src = (lib: string, file: string, member: string): IQualifiedSource => ({ 'source-lib': lib, 'source-file': file, 'source-member': member });


suite('Source inventory and filters', () => {

  test('one walk: files and empty folders, with / on every platform', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-src-'));
    try {
      fs.mkdirSync(path.join(root, 'lib1', 'qrpglesrc'), { recursive: true });
      fs.mkdirSync(path.join(root, 'lib1', 'qclsrc'), { recursive: true });
      fs.mkdirSync(path.join(root, 'lib2'), { recursive: true });
      fs.writeFileSync(path.join(root, 'lib1', 'qrpglesrc', 'a.rpgle.pgm'), '');
      fs.writeFileSync(path.join(root, 'lib1', 'qrpglesrc', 'notes.txt'), '');

      const entries = (await walk_sources(root))!.sort((a, b) => a.path.localeCompare(b.path));
      assert.deepStrictEqual(entries, [
        { path: 'lib1/qclsrc', empty_dir: true },
        { path: 'lib1/qrpglesrc/a.rpgle.pgm', empty_dir: false },
        { path: 'lib1/qrpglesrc/notes.txt', empty_dir: false },
        { path: 'lib2', empty_dir: true }
      ]);
      assert.deepStrictEqual(to_qualified(entries[0]), src('lib1', 'qclsrc', ''));
      assert.deepStrictEqual(to_qualified(entries[1]), src('lib1', 'qrpglesrc', 'a.rpgle.pgm'));
      assert.deepStrictEqual(to_qualified(entries[3]), src('lib2', '', ''));
      assert.ok(is_supported('lib1/qrpglesrc/a.rpgle.pgm', ['pgm', 'file']) && !is_supported('lib1/qrpglesrc/notes.txt', ['pgm']));

      assert.strictEqual(await walk_sources(path.join(root, 'missing')), undefined);
    }
    finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });


  test('wildcards are case-insensitive', () => {
    const filter = compile_filter(src('PROUZA*', 'q*src', '*.PGM'));
    assert.ok(filter.matches('prouzalib', 'QRPGLESRC', 'a.rpgle.pgm'));
    assert.ok(!filter.matches('other', 'qrpglesrc', 'a.rpgle.pgm'));
  });


  test('wildcards: * and ? only; # @ $ and a leading ! are normal characters', () => {
    assert.ok(compile_filter(src('#lib*', '@file', '$m?.pgm')).matches('#LIB1', '@FILE', '$M1.PGM'));
    assert.ok(!compile_filter(src('#lib*', '*', '*')).matches('lib1', 'f', 'm'));
    assert.ok(compile_filter(src('!x', '*', '*')).matches('!x', 'f', 'm'));
    assert.ok(compile_filter(src('*', '*', '*')).matches('lib', 'f', '.hidden.pgm'));
    assert.ok(!compile_filter(src('', '*', '*')).matches('lib', 'f', 'm'), 'an empty pattern matches only an empty name');
  });


  test('regular expressions: case-insensitive, the pattern is not lowercased, the whole value must match', () => {
    const filter = compile_filter({ ...src('lib\\D', 'qrpglesrc|qclsrc', '.*'), 'use-regex': true });
    assert.ok(filter.matches('LIBX', 'qclsrc', 'x.clle.pgm'));
    assert.ok(!filter.matches('lib1', 'qclsrc', 'x'), '\\D is not \\d');
    assert.ok(!filter.matches('libx', 'qclsrc2', 'x'), 'alternatives are anchored as a whole');
  });


  test('an invalid regex is reported and skipped; the other entries still work', () => {
    const invalid: string[] = [];
    const result = apply_source_filters(
      [src('lib', 'qrpglesrc', 'a.rpgle.pgm'), src('lib', 'qclsrc', 'b.clle.pgm')],
      [{ ...src('(', '*', '*'), 'use-regex': true }, src('*', 'qclsrc', '*')],
      (index, message) => invalid.push(`${index}: ${message}`));
    assert.deepStrictEqual(result, [src('lib', 'qclsrc', 'b.clle.pgm')]);
    assert.strictEqual(invalid.length, 1);
    assert.match(invalid[0], /^1: /);
  });


  test('a source matching several entries is listed once; empty folders only with show-empty-folders', () => {
    const sources = [src('lib', 'qrpglesrc', 'a.rpgle.pgm'), src('lib', 'qclsrc', ''), src('lib2', '', '')];
    const both = [src('*', '*', '*'), src('lib', '*', '*')];
    assert.deepStrictEqual(apply_source_filters(sources, both, () => undefined), [src('lib', 'qrpglesrc', 'a.rpgle.pgm')]);

    const with_empty = [{ ...src('*', '*', '*'), 'show-empty-folders': true }];
    assert.deepStrictEqual(apply_source_filters(sources, with_empty, () => undefined), sources);
  });
});
