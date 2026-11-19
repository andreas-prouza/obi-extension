import assert from 'assert';
import { classify_forced_sources, package_scope, single_source_scope, unbuildable_sources } from '../../extension/obi/compile_list/BuildScope';


suite('BuildScope', () => {

  test('forced sources: new if not in the compiled object list, otherwise changed (also with hash null)', () => {
    const built = { 'a/q/known.pgm': 'hash', 'a/q/null.pgm': null };
    assert.deepStrictEqual(classify_forced_sources(['a/q/new.pgm', 'a/q/known.pgm', 'a/q/null.pgm'], built), {
      'new-objects': ['a/q/new.pgm'],
      'changed-sources': ['a/q/known.pgm', 'a/q/null.pgm']
    });
    assert.deepStrictEqual(classify_forced_sources(['toString'], {}), { 'new-objects': ['toString'], 'changed-sources': [] });
  });


  test('scopes of one source and of a package', () => {
    assert.deepStrictEqual(single_source_scope('a/q/x.pgm'), { kind: 'sources', sources: ['a/q/x.pgm'] });
    const sources = ['a/q/x.pgm'];
    const scope = package_scope({ name: 'ABC-123', description: 'Order', sources, extra: { ticket: 'X' } });
    assert.deepStrictEqual(scope, { kind: 'sources', sources: ['a/q/x.pgm'], package: { name: 'ABC-123', description: 'Order' } });
    assert.ok(scope.kind === 'sources' && scope.sources !== sources, 'own copy of the list');
  });


  test('unbuildable sources: unsupported type, or missing', () => {
    const existing = new Set(['a/q/x.pgm', 'a/q/y.txt']);
    assert.deepStrictEqual(unbuildable_sources(['a/q/x.pgm', 'a/q/gone.pgm', 'a/q/y.txt', 'a/q/X.PGM'], ['pgm', 'file'], source => existing.has(source)),
      { missing: ['a/q/gone.pgm'], unsupported: ['a/q/y.txt', 'a/q/X.PGM'] });
    assert.deepStrictEqual(unbuildable_sources(['a/q/y.txt'], [], source => existing.has(source)), { missing: [], unsupported: [] });
  });
});
