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


  test('sources already built successfully are reset, because their result is outdated', () => {
    const list: CompileList = { compiles: [{ level: 1, sources: [source(A, 'failed')] }, { level: 2, sources: [source(B, 'success')] }, { level: 3, sources: [source(C)] }] };
    const result = mergeSourcesIntoCompileList(list, [A], dependencies, AppConfig.get_app_config());

    assert.deepStrictEqual(result.added, []);
    assert.deepStrictEqual(result.reset, [B]);
    assert.strictEqual(entry(list, B)?.status, undefined);
    assert.notStrictEqual(entry(list, B)?.cmds[0].cmd, `old ${B}`, 'new commands');
    assert.strictEqual(entry(list, A)?.status, 'failed', 'only successful ones are reset');
    assert.strictEqual(entry(list, A)?.cmds[0].cmd, `old ${A}`);
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
