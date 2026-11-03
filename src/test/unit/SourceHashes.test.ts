import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { compare_hashes, compute_source_hashes, has_extension, list_sources } from '../../extension/obi/compile_list/modules/source_hashes';
import { UserCancelledError } from '../../shared/Errors';


function project(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-hash-'));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, 'src', file)), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', file), content);
  }
  return root;
}


suite('Source hashes', () => {

  let root: string;
  teardown(() => fs.rmSync(root, { recursive: true, force: true }));


  test('md5 of the content, also for empty files; only supported extensions; "/" keys', async () => {
    root = project({ 'lib/qrpglesrc/a.rpgle.pgm': 'abc', 'lib/qrpglesrc/empty.rpgle.pgm': '', 'lib/qrpglesrc/b.notpgm': 'x', 'lib/qsrc/c.txt': 'x' });
    const hashes = await compute_source_hashes(path.join(root, 'src'), ['pgm'], { concurrency: 2 });

    assert.deepStrictEqual(hashes, {
      'lib/qrpglesrc/a.rpgle.pgm': '900150983cd24fb0d6963f7d28e17f72',
      'lib/qrpglesrc/empty.rpgle.pgm': 'd41d8cd98f00b204e9800998ecf8427e',
    });
  });


  test('extension filter uses the last suffix', () => {
    assert.ok(has_extension('a.rpgle.pgm', ['pgm']));
    assert.ok(!has_extension('a.notpgm', ['pgm']));
    assert.ok(!has_extension('pgm', ['pgm']));
    assert.ok(has_extension('anything', []));
  });


  test('cache: unchanged files are not read again, changed ones are, deleted ones are dropped', async () => {
    root = project({ 'lib/f/a.pgm': 'one', 'lib/f/b.pgm': 'two' });
    const src = path.join(root, 'src');
    const cache_file = path.join(root, '.obi', 'cache', 'source-hashes.json');

    // Whole seconds: utimes can't restore sub-millisecond timestamps
    const b = path.join(src, 'lib/f/b.pgm');
    const mtime = new Date('2026-01-01T10:00:00Z');
    fs.utimesSync(b, mtime, mtime);

    await compute_source_hashes(src, ['pgm'], { concurrency: 4, cache_file });

    // Same size and mtime, other content: proves the cached hash is used
    fs.writeFileSync(b, 'TWO');
    fs.utimesSync(b, mtime, mtime);
    fs.writeFileSync(path.join(src, 'lib/f/a.pgm'), 'changed');
    fs.mkdirSync(path.join(src, 'lib/g'));
    fs.writeFileSync(path.join(src, 'lib/g/c.pgm'), 'new');

    const second = await compute_source_hashes(src, ['pgm'], { concurrency: 4, cache_file });
    const without_cache = await compute_source_hashes(src, ['pgm'], { concurrency: 4, cache_file, use_cache: false });

    assert.notStrictEqual(second['lib/f/b.pgm'], without_cache['lib/f/b.pgm'], 'cached hash reused for b');
    assert.strictEqual(second['lib/f/a.pgm'], without_cache['lib/f/a.pgm'], 'changed size: re-hashed');
    assert.ok(second['lib/g/c.pgm']);

    fs.rmSync(path.join(src, 'lib/g'), { recursive: true });
    await compute_source_hashes(src, ['pgm'], { concurrency: 4, cache_file });
    const cache = JSON.parse(fs.readFileSync(cache_file, 'utf8'));
    assert.deepStrictEqual(Object.keys(cache.entries).sort(), ['lib/f/a.pgm', 'lib/f/b.pgm']);
  });


  test('cancellation between files', async () => {
    root = project({ 'lib/f/a.pgm': '1', 'lib/f/b.pgm': '2', 'lib/f/c.pgm': '3' });
    let checks = 0;
    await assert.rejects(
      () => compute_source_hashes(path.join(root, 'src'), ['pgm'], { concurrency: 1, is_cancelled: () => ++checks > 1 }),
      UserCancelledError);
  });


  test('missing source folder: no sources', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-hash-'));
    assert.deepStrictEqual(await list_sources(path.join(root, 'src'), ['pgm']), []);
  });


  test('comparison with the last build', () => {
    assert.deepStrictEqual(compare_hashes({ a: '1', b: '2', c: '3' }, { a: '1', b: 'x', d: '4', c: null }), { 'new-objects': [], 'changed-sources': ['b', 'c'] });
    assert.deepStrictEqual(compare_hashes({ a: '1', n: '2' }, { a: '1' }), { 'new-objects': ['n'], 'changed-sources': [] });
  });


  test('the result is sorted, whatever order the parallel reads finish in', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 40; i++)
      files[`lib/f/s${String(i).padStart(2, '0')}.pgm`] = 'x'.repeat((40 - i) * 1000);   // big files first
    root = project(files);
    const keys = Object.keys(await compute_source_hashes(path.join(root, 'src'), ['pgm'], { concurrency: 8 }));
    assert.deepStrictEqual(keys, [...keys].sort());
  });
});

