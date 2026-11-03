import assert from 'assert';
import * as path from 'path';
import { local_source_dir, local_source_root, relative_inside } from '../../extension/utilities/SourcePath';


suite('Source paths', () => {

  test('Windows: every backslash is converted, drive letter and folders are case-insensitive', () => {
    assert.strictEqual(relative_inside('C:\\ws\\src', 'c:\\WS\\src\\lib\\qrpglesrc\\a.rpgle.pgm', path.win32), 'lib/qrpglesrc/a.rpgle.pgm');
  });


  test('Windows: a sibling folder with the same prefix is outside', () => {
    assert.strictEqual(relative_inside('C:\\ws\\src', 'C:\\ws\\srclib\\x.pgm', path.win32), undefined);
  });


  test('the source folder name inside a library name is kept', () => {
    assert.strictEqual(relative_inside('/ws/src', '/ws/src/srclib/qrpglesrc/a.pgm', path.posix), 'srclib/qrpglesrc/a.pgm');
  });


  test('files outside, the root itself and parent folders give undefined', () => {
    assert.strictEqual(relative_inside('/ws/src', '/other/x.pgm', path.posix), undefined);
    assert.strictEqual(relative_inside('/ws/src', '/ws/src', path.posix), undefined);
    assert.strictEqual(relative_inside('/ws/src', '/ws', path.posix), undefined);
    assert.strictEqual(relative_inside('C:\\ws\\src', 'D:\\ws\\src\\a.pgm', path.win32), undefined);
  });


  test('a name starting with two dots is inside', () => {
    assert.strictEqual(relative_inside('/ws/src', '/ws/src/..lib/f/a.pgm', path.posix), '..lib/f/a.pgm');
  });


  test('local-base-dir is part of the source root', () => {
    assert.strictEqual(local_source_root('/ws', 'base', 'src', path.posix), '/ws/base/src');
    assert.strictEqual(local_source_root('/ws', '.', 'src', path.posix), '/ws/src');
    assert.strictEqual(local_source_root('/ws', undefined, undefined, path.posix), '/ws/src');
    assert.strictEqual(local_source_dir('./', 'source', path.posix), 'source');
  });
});
