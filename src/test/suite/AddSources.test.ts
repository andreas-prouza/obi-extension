import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { mergeSourcesIntoCompileList, resetDependentStatuses } from '../../extension/obi/compile_list/modules/add_sources';
import { DirTool } from '../../extension/utilities/DirTool';
import { AppConfig } from '../../extension/config/AppConfig';
import { reset_workspace } from './workspace_fixture';


const A = 'prouzalib/qrpglesrc/a.rpgle.pgm';
const B = 'prouzalib/qrpglesrc/b.rpgle.pgm';
const C = 'prouzalib/qrpglesrc/c.rpgle.pgm';
const D = 'prouzalib/qrpglesrc/d.rpgle.pgm';

interface Source { source: string; status?: string; cmds: { cmd: string; status: string }[] }
interface CompileList { compiles: { level: number; sources: Source[] }[] }

const source = (name: string, status?: string): Source => ({ source: name, status, cmds: [{ cmd: `old ${name}`, status: status === 'success' ? 'success' : 'new' }] });
const levels = (list: CompileList) => list.compiles.map(level => [level.level, level.sources.map(item => item.source)]);
const entry = (list: CompileList, name: string) => list.compiles.flatMap(level => level.sources).find(item => item.source === name);


suite('Adding sources to a compile list', () => {

  // b depends on a, c depends on b
  const dependencies = { [B]: [A], [C]: [B] };

  setup(async () => {
    await reset_workspace();
    for (const name of [A, B, C, D])
      fs.mkdirSync(path.dirname(path.join(DirTool.get_local_source_dir(), name)), { recursive: true });
    for (const name of [A, B, C, D])
      fs.writeFileSync(path.join(DirTool.get_local_source_dir(), name), '**free');
    AppConfig.reset();
  });


  test('a new source without dependents is added to its level', () => {
    const list: CompileList = { compiles: [{ level: 1, sources: [source(A, 'success')] }] };
    const result = mergeSourcesIntoCompileList(list, [D], {}, AppConfig.get_app_config());

    assert.deepStrictEqual(result.added, [D]);
    assert.deepStrictEqual(result.reset, []);
    assert.deepStrictEqual(levels(list), [[1, [A, D]]]);
    assert.strictEqual(entry(list, A)?.status, 'success', 'the others stay as they are');
  });


  test('its dependents are added too, in later levels, and the levels stay sorted', () => {
    const list: CompileList = { compiles: [] };
    const result = mergeSourcesIntoCompileList(list, [A], dependencies, AppConfig.get_app_config());

    assert.deepStrictEqual(result.added.sort(), [A, B, C]);
    assert.deepStrictEqual(levels(list), [[1, [A]], [2, [B]], [3, [C]]]);
  });


  test('the added source always gets new commands; dependents built successfully keep their commands and are reset', () => {
    const list: CompileList = { compiles: [{ level: 1, sources: [source(A, 'failed')] }, { level: 2, sources: [source(B, 'success')] }, { level: 3, sources: [source(C)] }] };
    const result = mergeSourcesIntoCompileList(list, [A], dependencies, AppConfig.get_app_config());

    assert.deepStrictEqual(result.added, []);
    assert.deepStrictEqual(result.reset, [A, B]);
    assert.notStrictEqual(entry(list, A)?.cmds[0].cmd, `old ${A}`, 'new commands, whatever its status was');
    assert.strictEqual(entry(list, A)?.status, undefined);
    assert.strictEqual(entry(list, B)?.cmds[0].cmd, `old ${B}`, 'commands and output are kept');
    assert.strictEqual(entry(list, B)?.cmds[0].status, 'new');
    assert.strictEqual(entry(list, B)?.status, undefined);
    assert.strictEqual(entry(list, C)?.cmds[0].cmd, `old ${C}`, 'not built yet: unchanged');
  });


  test('the levels of the whole list are calculated again', () => {
    // b is in the list on level 1; adding a, which b depends on, moves b to level 2
    const list: CompileList = { compiles: [{ level: 1, sources: [source(B), source(D)] }] };
    mergeSourcesIntoCompileList(list, [A], { [B]: [A] }, AppConfig.get_app_config());

    assert.deepStrictEqual(levels(list), [[1, [D, A]], [2, [B]]]);
  });


  test('related copybooks are added on level 0 (ALWAYS_TRANSFER_RELATED_COPYBOOKS)', () => {
    const copybook = 'prouzalib/qrpglesrc/defs.rpgle.cpy';
    fs.writeFileSync(path.join(DirTool.get_local_source_dir(), copybook), '**free');
    const config = AppConfig.get_app_config();
    const with_copybooks = { ...config, global: { ...config.global, settings: { ...config.global.settings, general: { ...config.global.settings?.general, ALWAYS_TRANSFER_RELATED_COPYBOOKS: true } } } };
    const list: CompileList = { compiles: [] };

    const result = mergeSourcesIntoCompileList(list, [A], { [A]: [copybook] }, with_copybooks);
    assert.deepStrictEqual(result.added, [A, copybook]);
    assert.deepStrictEqual(levels(list), [[0, [copybook]], [1, [A]]]);
  });


  test('resetDependentStatuses follows the dependents and keeps the commands', () => {
    const list: CompileList = { compiles: [
      { level: 1, sources: [source(A, 'success'), source(D, 'success')] },
      { level: 2, sources: [source(B, 'failed')] },
      { level: 3, sources: [source(C, 'success')] }
    ] };
    const reset = resetDependentStatuses(list, [A], dependencies);

    assert.deepStrictEqual(reset.sort(), [A, C]);
    assert.strictEqual(entry(list, A)?.status, undefined);
    assert.strictEqual(entry(list, A)?.cmds[0].status, 'new');
    assert.strictEqual(entry(list, A)?.cmds[0].cmd, `old ${A}`);
    assert.strictEqual(entry(list, B)?.status, 'failed');
    assert.strictEqual(entry(list, D)?.status, 'success', 'not affected');
  });
});
