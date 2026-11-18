import assert from 'assert';
import { DependencyGraph } from '../../extension/obi/compile_list/modules/dependency_graph';
import { dependents_only_needed_by } from '../../extension/obi/compile_list/modules/ignore_sources';


const graph = (dict: Record<string, string[]>) => new DependencyGraph(dict, () => true);

/** Build list from levels of source names; a name ending in '!' is unchecked (ignore) */
const list = (...levels: string[][]) => ({
  compiles: levels.map((sources, index) => ({
    level: index + 1,
    sources: sources.map(name => ({ source: name.replace('!', ''), ignore: name.endsWith('!'), cmds: [] }))
  }))
});


suite('Dependents only needed by an unchecked source', () => {

  test('dependents of a changed source, transitively', () => {
    const deps = { d1: ['a'], d2: ['d1'] };
    assert.deepStrictEqual(dependents_only_needed_by(list(['a'], ['d1'], ['d2']), 'a', ['a'], graph(deps)), ['d1', 'd2']);
  });


  test('a dependent another checked changed source needs too is kept', () => {
    const deps = { d1: ['a'], d2: ['a', 'b'] };
    const compile_list = list(['a', 'b'], ['d1', 'd2']);
    assert.deepStrictEqual(dependents_only_needed_by(compile_list, 'a', ['a', 'b'], graph(deps)), ['d1']);
    // b already unchecked: d2 is only needed by a
    assert.deepStrictEqual(dependents_only_needed_by(list(['a', 'b!'], ['d1', 'd2']), 'a', ['a', 'b'], graph(deps)), ['d1', 'd2']);
  });


  test('changed dependents and already unchecked dependents are not offered', () => {
    const deps = { b: ['a'], c: ['a'] };
    assert.deepStrictEqual(dependents_only_needed_by(list(['a'], ['b', 'c!']), 'a', ['a', 'b'], graph(deps)), []);
  });


  test('unchecking a dependent: its own dependents, unless a checked root still leads to them', () => {
    const deps = { d1: ['a'], d2: ['d1'], e: ['b'], f: ['e', 'a'] };
    const compile_list = list(['a', 'b'], ['d1', 'e'], ['d2', 'f']);
    assert.deepStrictEqual(dependents_only_needed_by(compile_list, 'd1', ['a', 'b'], graph(deps)), []);
    assert.deepStrictEqual(dependents_only_needed_by(list(['a!', 'b'], ['d1', 'e'], ['d2', 'f']), 'd1', ['a', 'b'], graph(deps)), ['d2']);
  });


  test('sources added by hand count as roots, their dependents can be unchecked with them', () => {
    // m was added by hand (not in the changed list, no dependency in the list), x is its dependent
    const deps = { x: ['m'], d: ['a'] };
    const compile_list = list(['a', 'm'], ['d', 'x']);
    assert.deepStrictEqual(dependents_only_needed_by(compile_list, 'a', ['a'], graph(deps)), ['d']);
    assert.deepStrictEqual(dependents_only_needed_by(compile_list, 'm', ['a'], graph(deps)), ['x']);
  });


  test('related copybooks on level 0 lead to nothing; unknown source; empty list', () => {
    const deps = { p: ['a', 'c.cpy'] };
    const compile_list = { compiles: [{ level: 0, sources: [{ source: 'c.cpy', cmds: [] }] }, ...list(['a'], ['p']).compiles.map(l => ({ ...l }))] };
    assert.deepStrictEqual(dependents_only_needed_by(compile_list, 'a', ['a'], graph(deps)), ['p']);
    assert.deepStrictEqual(dependents_only_needed_by(compile_list, 'unknown', ['a'], graph(deps)), []);
    assert.deepStrictEqual(dependents_only_needed_by(undefined, 'a', ['a'], graph(deps)), []);
  });
});
