import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import { CachedFiles, deep_freeze, file_stamp } from '../../shared/CachedFiles';
import { debounce } from '../../shared/Debounce';


suite('Change-based caches', () => {

  let dir: string;

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-cache-'));
  });

  teardown(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });


  test('loads once while the file is unchanged, again after it was written', () => {
    const file = path.join(dir, 'a.toml');
    fs.writeFileSync(file, 'one');
    let loads = 0;
    const cache = new CachedFiles(() => [file], files => { loads++; return fs.readFileSync(files[0], 'utf8'); });

    assert.strictEqual(cache.get(), 'one');
    assert.strictEqual(cache.get(), 'one');
    assert.strictEqual(loads, 1);

    fs.writeFileSync(file, 'two!');
    assert.strictEqual(cache.get(), 'two!');
    assert.strictEqual(loads, 2);

    // Same size and time, but replaced (atomic write): another inode
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, 'thre');
    const { atime, mtime } = fs.statSync(file);
    fs.utimesSync(tmp, atime, mtime);
    fs.renameSync(tmp, file);
    assert.strictEqual(cache.get(), 'thre');

    cache.reset();
    cache.get();
    assert.strictEqual(loads, 4);
  });


  test('another file list (e.g. another profile) and deleted or created files load again', () => {
    const default_profile = path.join(dir, '.user-app-config.toml');
    const prod_profile = path.join(dir, '.user-app-config-prod.toml');
    fs.writeFileSync(default_profile, 'default');
    let current = default_profile;
    const cache = new CachedFiles(() => [current], files => fs.existsSync(files[0]) ? fs.readFileSync(files[0], 'utf8') : 'none');

    assert.strictEqual(cache.get(), 'default');
    current = prod_profile;
    assert.strictEqual(cache.get(), 'none');
    fs.writeFileSync(prod_profile, 'prod');
    assert.strictEqual(cache.get(), 'prod');
    fs.rmSync(prod_profile);
    assert.strictEqual(file_stamp(prod_profile), 'missing');
    assert.strictEqual(cache.get(), 'none');
  });


  test('a load error is thrown again without loading until the file changes', () => {
    const file = path.join(dir, 'broken.json');
    fs.writeFileSync(file, '{"a": ');
    let loads = 0;
    const cache = new CachedFiles(() => [file], files => { loads++; return JSON.parse(fs.readFileSync(files[0], 'utf8')); });

    assert.throws(() => cache.get(), SyntaxError);
    assert.throws(() => cache.get(), SyntaxError);
    assert.strictEqual(loads, 1);

    fs.writeFileSync(file, '{"a": 1}');
    assert.deepStrictEqual(cache.get(), { a: 1 });
    assert.strictEqual(loads, 2);
  });


  test('deep_freeze freezes nested objects and arrays', () => {
    const value = deep_freeze({ general: { libs: ['A'] } });
    assert.ok(Object.isFrozen(value.general) && Object.isFrozen(value.general.libs));
    assert.throws(() => { (value.general.libs as string[]).push('B'); }, TypeError);
  });




  test('debounce: a burst of calls runs once after the last call', () => {
    const clock = sinon.useFakeTimers();
    try {
      let runs = 0;
      const refresh = debounce(() => runs++, 200);
      for (let i = 0; i < 10; i++) {
        refresh();
        clock.tick(10);
      }
      assert.strictEqual(runs, 0);
      clock.tick(200);
      assert.strictEqual(runs, 1);

      refresh();
      refresh.cancel();
      clock.tick(500);
      assert.strictEqual(runs, 1);
    }
    finally {
      clock.restore();
    }
  });
});
