import assert from 'assert';
import {
  BuildPackage, is_valid_package_name, package_file_name, package_info, package_matches, package_name_of_file, parse_build_package, parse_dragged_sources,
  serialize_build_package, suggest_package_name, validate_package_name, with_source_renamed, with_sources, without_sources
} from '../../shared/BuildPackage';
import { ConfigFileError } from '../../shared/Errors';


const pkg = (sources: string[], extra: Record<string, unknown> = {}, description?: string): BuildPackage =>
  ({ name: 'ABC-123', description, sources, extra });


suite('BuildPackage', () => {

  test('package names: letters, digits, . _ - and no device names', () => {
    for (const name of ['ABC-123', 'release-2.1', 'a', 'my_pkg', 'x'.repeat(100), 'console'])
      assert.ok(is_valid_package_name(name), name);
    for (const name of ['', '-a', '.a', '_a', 'a/b', 'a\\b', '..', '../x', 'a b', 'ä', 'x'.repeat(101), 'CON', 'nul.txt', 'com1', 'LPT9'])
      assert.ok(!is_valid_package_name(name), JSON.stringify(name));
  });


  test('file names', () => {
    assert.strictEqual(package_file_name('ABC-123'), 'ABC-123.json');
    assert.throws(() => package_file_name('../x'));
    assert.strictEqual(package_name_of_file('ABC-123.json'), 'ABC-123');
    assert.strictEqual(package_name_of_file('release-2.1.json'), 'release-2.1');
    assert.strictEqual(package_name_of_file('ABC-123.json.tmp'), undefined);
    assert.strictEqual(package_name_of_file('.hidden.json'), undefined);
    assert.strictEqual(package_name_of_file('readme.md'), undefined);
  });


  test('validate_package_name: invalid, and taken also with another case', () => {
    assert.strictEqual(validate_package_name('ABC-124', ['ABC-123']), undefined);
    assert.strictEqual(validate_package_name('a/b', []), 'invalid');
    assert.strictEqual(validate_package_name('ABC-123', ['ABC-123']), 'exists');
    assert.strictEqual(validate_package_name('abc-123', ['ABC-123']), 'exists');
    // Rename: only the case of the own name changes
    assert.strictEqual(validate_package_name('abc-123', ['ABC-123'], 'ABC-123'), undefined);
    assert.strictEqual(validate_package_name('abc-123', ['ABC-123', 'x'], 'x'), 'exists');
  });


  test('suggest_package_name from a git branch', () => {
    assert.strictEqual(suggest_package_name('feature/ABC-123 x'), 'feature-ABC-123-x');
    assert.strictEqual(suggest_package_name('main'), 'main');
    assert.strictEqual(suggest_package_name('bugfix//a__b'), 'bugfix-a__b');
    assert.strictEqual(suggest_package_name('-/x/'), 'x');
    assert.strictEqual(suggest_package_name('release/2.1.'), 'release-2.1');
    assert.strictEqual(suggest_package_name('äöü'), undefined);
    assert.strictEqual(suggest_package_name('HEAD'), undefined);
    assert.strictEqual(suggest_package_name(undefined), undefined);
    assert.strictEqual(suggest_package_name('a'.repeat(150))?.length, 100);
  });


  test('suggest_package_name: the next free name if the branch has a package already', () => {
    assert.strictEqual(suggest_package_name('feature/ABC-123', ['feature-ABC-123']), 'feature-ABC-123-2');
    assert.strictEqual(suggest_package_name('feature/ABC-123', ['FEATURE-abc-123', 'feature-ABC-123-2']), 'feature-ABC-123-3');
    assert.strictEqual(suggest_package_name('a'.repeat(150), ['a'.repeat(100)]), `${'a'.repeat(98)}-2`);
  });


  test('parse: sources sorted without duplicates, description, other keys kept', () => {
    const result = parse_build_package('ABC-123', '{"ticket": "ABC-123", "sources": ["b/q/z.pgm", "a/q/y.pgm", "b/q/z.pgm"], "description": "Order"}', 'f.json');
    assert.deepStrictEqual(result.sources, ['a/q/y.pgm', 'b/q/z.pgm']);
    assert.strictEqual(result.description, 'Order');
    assert.strictEqual(result.extra['ticket'], 'ABC-123');
    assert.deepStrictEqual(package_info(result), { name: 'ABC-123', description: 'Order' });
  });


  test('parse: empty file and object without sources are empty packages', () => {
    assert.deepStrictEqual(parse_build_package('p', '', 'f.json').sources, []);
    assert.deepStrictEqual(parse_build_package('p', '{}', 'f.json').sources, []);
    assert.deepStrictEqual(package_info(parse_build_package('p', '{"description": ""}', 'f.json')), { name: 'p' });
  });


  test('parse: invalid content is a ConfigFileError', () => {
    assert.throws(() => parse_build_package('p', '{\n  "sources": ["a/q/y.pgm" "b/q/z.pgm"]\n}', 'f.json'),
      (e: unknown) => e instanceof ConfigFileError && e.file === 'f.json' && e.line === 2);

    for (const text of ['[]', '"x"', 'null', '{"sources": "a/b/c.pgm"}', '{"sources": [1]}', '{"description": 1}',
                        '{"sources": ["../x/y.pgm"]}', '{"sources": ["/lib/f/m.pgm"]}', '{"sources": ["lib\\\\f\\\\m.pgm"]}', '{"sources": ["a b.pgm"]}'])
      assert.throws(() => parse_build_package('p', text, 'f.json'), ConfigFileError, text);
  });


  test('serialize: stable, one source per line, trailing newline', () => {
    const text = serialize_build_package(pkg(['b/q/z.pgm', 'a/q/y.pgm', 'a/q/y.pgm'], {}, 'Order'));
    assert.strictEqual(text, '{\n  "description": "Order",\n  "sources": [\n    "a/q/y.pgm",\n    "b/q/z.pgm"\n  ]\n}\n');
    assert.strictEqual(serialize_build_package(parse_build_package('ABC-123', text, 'f.json')), text);
    assert.strictEqual(serialize_build_package(pkg([])), '{\n  "sources": []\n}\n');
  });


  test('serialize: other keys and their order are kept, an empty description is removed', () => {
    const read = parse_build_package('p', '{"sources": ["a/q/y.pgm"], "ticket": "X", "description": "old"}', 'f.json');
    const text = serialize_build_package({ ...read, description: undefined });
    assert.strictEqual(text, '{\n  "sources": [\n    "a/q/y.pgm"\n  ],\n  "ticket": "X"\n}\n');
  });


  test('add, remove and rename sources', () => {
    const added = with_sources(pkg(['b/q/z.pgm']), ['a/q/y.pgm', 'b/q/z.pgm']);
    assert.deepStrictEqual(added.added, ['a/q/y.pgm']);
    assert.deepStrictEqual(added.pkg.sources, ['a/q/y.pgm', 'b/q/z.pgm']);
    assert.throws(() => with_sources(pkg([]), ['../etc/passwd']));

    const removed = without_sources(added.pkg, ['a/q/y.pgm', 'c/q/x.pgm']);
    assert.deepStrictEqual(removed.removed, ['a/q/y.pgm']);
    assert.deepStrictEqual(removed.pkg.sources, ['b/q/z.pgm']);

    assert.deepStrictEqual(with_source_renamed(pkg(['b/q/z.pgm', 'c/q/c.pgm']), 'c/q/c.pgm', 'a/q/a.pgm')?.sources, ['a/q/a.pgm', 'b/q/z.pgm']);
    assert.strictEqual(with_source_renamed(pkg(['b/q/z.pgm']), 'c/q/c.pgm', 'a/q/a.pgm'), undefined);
    assert.throws(() => with_source_renamed(pkg(['b/q/z.pgm']), 'b/q/z.pgm', 'b/q/a b.pgm'));
  });


  test('archived: read and written only when set', () => {
    const read = parse_build_package('p', '{"sources": [], "archived": true}', 'f.json');
    assert.strictEqual(read.archived, true);
    assert.strictEqual(serialize_build_package(read), '{\n  "sources": [],\n  "archived": true\n}\n');
    assert.strictEqual(serialize_build_package({ ...read, archived: false }), '{\n  "sources": []\n}\n');
    assert.ok(!('archived' in parse_build_package('p', '{"archived": false}', 'f.json')));
    assert.throws(() => parse_build_package('p', '{"archived": "yes"}', 'f.json'), ConfigFileError);
  });


  test('text filter: name, description or a source, not case-sensitive', () => {
    const p = pkg(['mylib/qrpglesrc/order.pgm'], {}, 'Invoice rework');
    for (const filter of ['', '  ', 'abc', 'INVOICE', 'order.pgm', 'qrpglesrc'])
      assert.ok(package_matches(p, filter), filter);
    assert.ok(!package_matches(p, 'xyz'));
  });


  test('dragged sources: a JSON list of valid source names', () => {
    assert.deepStrictEqual(parse_dragged_sources('["a/q/x.pgm", "a/q/x.pgm", "../etc/passwd", 1, "a/q/y.pgm"]'), ['a/q/x.pgm', 'a/q/y.pgm']);
    for (const text of ['', 'x', '{"a": 1}', 'null'])
      assert.deepStrictEqual(parse_dragged_sources(text), [], text);
  });
});
