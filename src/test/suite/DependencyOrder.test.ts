import assert from 'assert';
import * as path from 'path';
import * as fse from 'fs-extra';
import { AppConfig } from '../../extension/config/AppConfig';
import { DirTool } from '../../extension/utilities/DirTool';
import { getBuildPlan } from '../../extension/obi/compile_list/modules/dependency';
import { orderBuilds } from '../../extension/obi/compile_list/modules/build_cmds';
import { reset_workspace } from './workspace_fixture';


// Short names → sources of the fixture's types (commands exist for them)
const S = (name: string) => name.endsWith('.file') || name.endsWith('.cpy') ? `lib/qsrc/${name}` : `lib/qsrc/${name}.rpgle.pgm`;

/** Writes the sources (all but `missing`) and returns { level: sorted short names } of the build plan */
async function levels(dependencies: Record<string, string[]>, targets: string[], missing: string[] = []): Promise<Record<number, string[]>> {
  const names = new Set([...targets, ...Object.keys(dependencies), ...Object.values(dependencies).flat()]);
  for (const name of names) {
    if (!missing.includes(name))
      await fse.outputFile(path.join(DirTool.get_local_source_dir(), S(name)), '**free');
  }
  const dict = Object.fromEntries(Object.entries(dependencies).map(([k, v]) => [S(k), v.map(S)]));
  const plan = getBuildPlan(dict, targets.map(S));

  const result: Record<number, string[]> = {};
  for (const level of plan.tree.compiles as { level: number; sources: { source: string }[] }[]) {
    if (level.sources.length > 0)
      result[level.level] = level.sources.map(s => s.source.replace(/^lib\/qsrc\//, '').replace(/\.rpgle\.pgm$/, '')).sort();
  }
  return result;
}


suite('Build order of dependent sources (characterization)', () => {

  setup(async () => {
    await reset_workspace();
    AppConfig.reset();
  });


  test('chain: level = length of the dependency path', async () => {
    assert.deepStrictEqual(await levels({ b: ['a'], c: ['b'] }, ['a']), { 1: ['a'], 2: ['b'], 3: ['c'] });
  });


  test('diamond: the shared dependent is built once, after both paths', async () => {
    assert.deepStrictEqual(await levels({ b: ['a'], c: ['a'], d: ['b', 'c'] }, ['a']), { 1: ['a'], 2: ['b', 'c'], 3: ['d'] });
  });


  test('longest path wins', async () => {
    assert.deepStrictEqual(await levels({ b: ['a'], c: ['b'], d: ['a', 'c'] }, ['a']), { 1: ['a'], 2: ['b'], 3: ['c'], 4: ['d'] });
  });


  test('a target that depends on another target is built after it', async () => {
    assert.deepStrictEqual(await levels({ b: ['a'] }, ['a', 'b']), { 1: ['a'], 2: ['b'] });
  });


  test('a dependent without source file is skipped and not followed', async () => {
    assert.deepStrictEqual(await levels({ b: ['a'], c: ['b'], x: ['a'] }, ['a'], ['b']), { 1: ['a'], 2: ['x'] });
  });


  test('unrelated targets are on level 1; dependents are listed', async () => {
    const dict = { b: ['a'] };
    assert.deepStrictEqual(await levels(dict, ['a', 'z']), { 1: ['a', 'z'], 2: ['b'] });
    const plan = getBuildPlan({ [S('b')]: [S('a')] }, [S('a'), S('z')]);
    assert.deepStrictEqual(plan.dependents, [S('b')]);
  });


  test('a dependency cycle stops with an error', async () => {
    await assert.rejects(() => levels({ a: ['b'], b: ['a'] }, ['a']), /cycle|recursion/i);
  });


  test('*.file sources first within a level', async () => {
    const plan = getBuildPlan({}, [S('a'), S('t.pf.file')]);
    const ordered = orderBuilds(plan.tree);
    assert.deepStrictEqual(ordered.compiles[0].sources.map((s: { source: string }) => s.source), [S('t.pf.file'), S('a')]);
  });


  test('ALWAYS_TRANSFER_RELATED_COPYBOOKS: copybooks the build needs come first (level 0)', async () => {
    for (const name of ['a', 'b', 'defs.rpgle.cpy', 'other.rpgle.cpy'])
      await fse.outputFile(path.join(DirTool.get_local_source_dir(), S(name)), '**free');
    const config = AppConfig.get_app_config();
    const with_copybooks = { ...config, global: { ...config.global, settings: { ...config.global.settings, general: { ...config.global.settings?.general, ALWAYS_TRANSFER_RELATED_COPYBOOKS: true } } } };

    const plan = getBuildPlan({ [S('b')]: [S('a'), S('defs.rpgle.cpy')], [S('a')]: [S('other.rpgle.cpy')] }, [S('a')], with_copybooks);
    const level_0 = (plan.tree.compiles as { level: number; sources: { source: string }[] }[]).find(level => level.level === 0);
    assert.deepStrictEqual(level_0?.sources.map(s => s.source).sort(), [S('defs.rpgle.cpy'), S('other.rpgle.cpy')]);
  });
});

