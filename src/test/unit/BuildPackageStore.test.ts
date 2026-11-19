import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BuildPackageNameError, BuildPackageStore } from '../../extension/obi/BuildPackageStore';
import { BUILD_PACKAGE_DIR } from '../../shared/BuildPackage';
import { ConfigFileError } from '../../shared/Errors';


suite('BuildPackageStore', () => {

  const created: string[] = [];
  const store = () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-build-packages-'));
    created.push(ws);
    return new BuildPackageStore(ws);
  };
  teardown(() => created.splice(0).forEach(ws => fs.rmSync(ws, { recursive: true, force: true })));

  const write = (s: BuildPackageStore, file: string, content: string) => {
    fs.mkdirSync(s.dir(), { recursive: true });
    fs.writeFileSync(path.join(s.dir(), file), content);
  };


  test('no folder: no packages', () => {
    const s = store();
    assert.deepStrictEqual(s.names(), []);
    assert.deepStrictEqual(s.list(), []);
    assert.strictEqual(s.read('ABC-123'), undefined);
  });


  test('create writes the file into .obi/build-packages, sorted', () => {
    const s = store();
    s.create('ABC-123', 'Order', ['b/q/z.pgm', 'a/q/y.pgm']);
    assert.ok(s.file('ABC-123').endsWith(path.join(...BUILD_PACKAGE_DIR.split('/'), 'ABC-123.json')));
    assert.strictEqual(fs.readFileSync(s.file('ABC-123'), 'utf8'),
      '{\n  "description": "Order",\n  "sources": [\n    "a/q/y.pgm",\n    "b/q/z.pgm"\n  ]\n}\n');
    assert.deepStrictEqual(s.get('ABC-123').sources, ['a/q/y.pgm', 'b/q/z.pgm']);
  });


  test('create refuses invalid and existing names (also another case)', () => {
    const s = store();
    s.create('ABC-123');
    assert.throws(() => s.create('abc-123'), (e: unknown) => e instanceof BuildPackageNameError && e.problem === 'exists');
    assert.throws(() => s.create('../x'), (e: unknown) => e instanceof BuildPackageNameError && e.problem === 'invalid');
    assert.deepStrictEqual(s.names(), ['ABC-123']);
  });


  test('names: only package files, sorted case-insensitively', () => {
    const s = store();
    for (const name of ['b', 'A', 'c'])
      s.create(name);
    write(s, 'notes.txt', 'x');
    write(s, '.hidden.json', '{}');
    fs.mkdirSync(path.join(s.dir(), 'folder.json'));
    assert.deepStrictEqual(s.names(), ['A', 'b', 'c']);
  });


  test('list reports files that are not valid packages', () => {
    const s = store();
    s.create('good', undefined, ['a/q/y.pgm']);
    write(s, 'bad.json', '{ "sources": [');
    const list = s.list();
    assert.deepStrictEqual(list.map(entry => entry.name), ['bad', 'good']);
    assert.ok(list[0].error && !list[0].pkg);
    assert.deepStrictEqual(list[1].pkg?.sources, ['a/q/y.pgm']);
  });


  test('rename and delete', () => {
    const s = store();
    s.create('old', undefined, ['a/q/y.pgm']);
    s.create('other');
    assert.throws(() => s.rename('old', 'OTHER'), BuildPackageNameError);
    s.rename('old', 'new');
    assert.deepStrictEqual(s.names(), ['new', 'other']);
    assert.deepStrictEqual(s.get('new').sources, ['a/q/y.pgm']);
    assert.throws(() => s.rename('missing', 'x'), /not found/);

    s.delete('new');
    assert.deepStrictEqual(s.names(), ['other']);
  });


  test('add and remove sources; nothing to change leaves the file untouched', () => {
    const s = store();
    write(s, 'p.json', '{"sources": ["b/q/z.pgm"], "ticket": "X"}');
    assert.deepStrictEqual(s.add_sources('p', ['a/q/y.pgm', 'b/q/z.pgm']), ['a/q/y.pgm']);
    assert.strictEqual(fs.readFileSync(s.file('p'), 'utf8'), '{\n  "sources": [\n    "a/q/y.pgm",\n    "b/q/z.pgm"\n  ],\n  "ticket": "X"\n}\n');

    write(s, 'q.json', '{"sources":["a/q/y.pgm"]}');
    assert.deepStrictEqual(s.add_sources('q', ['a/q/y.pgm']), []);
    assert.deepStrictEqual(s.remove_sources('q', ['c/q/x.pgm']), []);
    s.set_description('q', '  ');
    assert.strictEqual(fs.readFileSync(s.file('q'), 'utf8'), '{"sources":["a/q/y.pgm"]}');

    assert.deepStrictEqual(s.remove_sources('p', ['b/q/z.pgm']), ['b/q/z.pgm']);
    s.set_description('p', ' Order ');
    assert.strictEqual(s.get('p').description, 'Order');
    assert.deepStrictEqual(s.get('p').sources, ['a/q/y.pgm']);
    assert.throws(() => s.add_sources('missing', ['a/q/y.pgm']), /not found/);
  });


  test('a file that is not a valid package is never overwritten', () => {
    const s = store();
    write(s, 'bad.json', '{ "sources": [');
    assert.throws(() => s.add_sources('bad', ['a/q/y.pgm']), ConfigFileError);
    assert.strictEqual(fs.readFileSync(s.file('bad'), 'utf8'), '{ "sources": [');
  });


  test('rename_source_everywhere changes only packages containing the source', () => {
    const s = store();
    s.create('p1', undefined, ['lib/q/old.pgm', 'lib/q/x.pgm']);
    write(s, 'p2.json', '{"sources":["lib/q/x.pgm"]}');
    write(s, 'bad.json', '{');
    const result = s.rename_source_everywhere('lib/q/old.pgm', 'lib/q/new.pgm');
    assert.deepStrictEqual(result.changed, ['p1']);
    assert.strictEqual(result.errors.length, 1);
    assert.match(result.errors[0], /^bad: /);
    assert.deepStrictEqual(s.get('p1').sources, ['lib/q/new.pgm', 'lib/q/x.pgm']);
    assert.strictEqual(fs.readFileSync(s.file('p2'), 'utf8'), '{"sources":["lib/q/x.pgm"]}');
  });


  test('archive and restore; nothing to change leaves the file untouched', () => {
    const s = store();
    write(s, 'p.json', '{"sources":["a/q/y.pgm"]}');
    s.set_archived('p', false);
    assert.strictEqual(fs.readFileSync(s.file('p'), 'utf8'), '{"sources":["a/q/y.pgm"]}');
    s.set_archived('p', true);
    assert.strictEqual(s.get('p').archived, true);
    assert.strictEqual(s.list()[0].pkg?.archived, true);
    s.set_archived('p', false);
    assert.strictEqual(s.get('p').archived, undefined);
  });
});
