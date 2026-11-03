import assert from 'assert';
import { DependencyCycleError, DependencyGraph } from '../../extension/obi/compile_list/modules/dependency_graph';


const all_exist = () => true;
const levels = (dict: Record<string, string[]>, targets: string[], exists: (s: string) => boolean = all_exist) =>
  new DependencyGraph(dict, exists).build_levels(targets).map(l => [l.level, [...l.sources].sort()]);


suite('Dependency graph', () => {

  test('chain, diamond and longest path', () => {
    assert.deepStrictEqual(levels({ b: ['a'], c: ['b'] }, ['a']), [[1, ['a']], [2, ['b']], [3, ['c']]]);
    assert.deepStrictEqual(levels({ b: ['a'], c: ['a'], d: ['b', 'c'] }, ['a']), [[1, ['a']], [2, ['b', 'c']], [3, ['d']]]);
    assert.deepStrictEqual(levels({ b: ['a'], c: ['b'], d: ['a', 'c'] }, ['a']), [[1, ['a']], [2, ['b']], [3, ['c']], [4, ['d']]]);
  });


  test('targets that depend on targets; unrelated targets; missing dependents', () => {
    assert.deepStrictEqual(levels({ b: ['a'] }, ['a', 'b', 'z']), [[1, ['a', 'z']], [2, ['b']]]);
    assert.deepStrictEqual(levels({ b: ['a'], c: ['b'], x: ['a'] }, ['a'], s => s !== 'b'), [[1, ['a']], [2, ['x']]]);
  });


  test('discovery order within a level: targets in the given order first', () => {
    const graph = new DependencyGraph({ y: ['t2'], x: ['t1'] }, all_exist);
    assert.deepStrictEqual(graph.build_levels(['t2', 't1']), [{ level: 1, sources: ['t2', 't1'] }, { level: 2, sources: ['y', 'x'] }]);
    assert.deepStrictEqual(graph.affected_by(['t1', 't2']), ['x', 'y']);
  });


  test('cycles are reported with their path', () => {
    assert.throws(() => levels({ a: ['b'], b: ['a'] }, ['a']), (e: unknown) => e instanceof DependencyCycleError && e.message === 'Dependency cycle: a → b → a');
    assert.throws(() => levels({ x: ['t', 'y'], y: ['x'] }, ['t']), /Dependency cycle: (x → y → x|y → x → y)/);
    assert.throws(() => levels({ a: ['a'] }, ['a']), /a → a/);
  });


  test('forward closure for copybooks', () => {
    const graph = new DependencyGraph({ p: ['q', 'c1.cpy'], q: ['c2.cpy', 'c1.cpy'] }, all_exist);
    assert.deepStrictEqual(graph.dependencies_of(['p']), ['q', 'c2.cpy', 'c1.cpy']);
  });


  test('5,000 objects, 20,000 dependencies, 200 targets in well under a second', function () {
    this.timeout(5000);
    const dict: Record<string, string[]> = {};
    for (let i = 0; i < 5000; i++) {
      const deps: string[] = [];
      for (let k = 1; k <= 4 && i - k * 7 >= 0; k++)
        deps.push(`o${i - k * 7}`);   // only on lower numbers: no cycles
      dict[`o${i}`] = deps;
    }
    const targets = Array.from({ length: 200 }, (_, i) => `o${i * 3}`);

    const started = Date.now();
    const result = new DependencyGraph(dict, all_exist).build_levels(targets);
    const elapsed = Date.now() - started;

    assert.ok(result.length > 1);
    assert.ok(elapsed < 1000, `${elapsed} ms`);
  });
});
