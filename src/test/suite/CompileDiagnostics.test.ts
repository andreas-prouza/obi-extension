import assert from 'assert';
import * as path from 'path';
import * as fse from 'fs-extra';
import * as vscode from 'vscode';
import { Workspace } from '../../extension/utilities/Workspace';
import { AppConfig } from '../../extension/config/AppConfig';
import { DirTool } from '../../extension/utilities/DirTool';
import { CompileDiagnostics } from '../../extension/source/CompileDiagnostics';
import { reset_workspace } from './workspace_fixture';


const FIXTURES = path.resolve(__dirname, '../../../test-resources/evfevent');
const MAIN = 'display/qrpglesrc/hello.rpgle';
const COPYBOOKS = ['display/qprotsrc/constants.rpgle', 'display/qprotsrc/constLeve2.rpgle'];

const uri_of = (source: string) => vscode.Uri.file(path.join(DirTool.get_local_source_dir(), source));
const lines_of = (source: string) => vscode.languages.getDiagnostics(uri_of(source)).map(d => d.range.start.line + 1);


suite('Compile messages in the Problems view', () => {

  setup(async () => {
    await reset_workspace();
    AppConfig.reset();
    for (const source of [MAIN, ...COPYBOOKS, 'barry/qrpglesrc/typical.rpgle.pgm'])
      await fse.outputFile(path.join(DirTool.get_local_source_dir(), source), '**free\n');
    CompileDiagnostics.clear();
  });

  teardown(() => CompileDiagnostics.reset());


  test('messages go to the source and to its copybooks; a successful build removes them', async () => {
    const root = CompileDiagnostics.evfevent_root() ?? '';
    assert.strictEqual(root, path.join(Workspace.get_workspace(), '.obi', 'tmp', 'evfevent'));
    await fse.copy(path.join(FIXTURES, 'NESTED_COPYBOOK.PGM.evfevent'), path.join(root, MAIN));

    CompileDiagnostics.load_for_compile_list({ compiles: [{ sources: [{ source: MAIN, status: 'failed' }] }] }, root);

    assert.deepStrictEqual(lines_of('display/qprotsrc/constLeve2.rpgle'), [4, 4, 3]);
    assert.deepStrictEqual(lines_of('display/qprotsrc/constants.rpgle'), [3, 4]);
    const main = vscode.languages.getDiagnostics(uri_of(MAIN));
    assert.strictEqual(main.length, 7);
    assert.deepStrictEqual([main[0].range.start.character, main[0].range.end.character, main[0].code, main[0].severity], [0, 5, 'RNF3312', vscode.DiagnosticSeverity.Error]);

    await fse.remove(path.join(root, MAIN));
    CompileDiagnostics.load_for_compile_list({ compiles: [{ sources: [{ source: MAIN, status: 'success' }] }] }, root);
    for (const source of [MAIN, ...COPYBOOKS])
      assert.deepStrictEqual(vscode.languages.getDiagnostics(uri_of(source)), [], source);
  });


  test('messages of QSYS members are shown on the source with their location', async () => {
    const root = CompileDiagnostics.evfevent_root() ?? '';
    const source = 'barry/qrpglesrc/typical.rpgle.pgm';
    await fse.copy(path.join(FIXTURES, 'TYPICAL.PGM.evfevent'), path.join(root, source));

    CompileDiagnostics.load_source(source, root);

    const messages = vscode.languages.getDiagnostics(uri_of(source));
    assert.ok(messages.length > 0);
    assert.ok(messages.some(m => m.message.includes('(in BARRY/QRPGLESRC(VSCODEINC2), line 8)')));
    assert.ok(messages.every(m => m.range.start.line === 0));
  });


  test('a failed build without new messages removes the old ones; a source that wasn\'t built keeps them', async () => {
    const root = CompileDiagnostics.evfevent_root() ?? '';
    const other = 'barry/qrpglesrc/typical.rpgle.pgm';
    await fse.copy(path.join(FIXTURES, 'NESTED_COPYBOOK.PGM.evfevent'), path.join(root, MAIN));
    await fse.copy(path.join(FIXTURES, 'TYPICAL.PGM.evfevent'), path.join(root, other));
    CompileDiagnostics.load_for_compile_list({ compiles: [{ sources: [{ source: MAIN, status: 'failed' }, { source: other, status: 'failed' }] }] }, root);
    assert.ok(vscode.languages.getDiagnostics(uri_of(MAIN)).length > 0);
    assert.ok(vscode.languages.getDiagnostics(uri_of(other)).length > 0);

    // Next build: MAIN failed before the compile (no events), `other` wasn't reached
    await fse.remove(path.join(root, MAIN));
    await fse.remove(path.join(root, other));
    CompileDiagnostics.load_for_compile_list({ compiles: [{ sources: [
      { source: MAIN, cmds: [{ cmd: 'CHGATR', status: 'failed' }, { cmd: 'CRTBNDRPG', status: 'new' }] },
      { source: other, cmds: [{ cmd: 'CRTBNDRPG', status: 'new' }] },
    ] }] }, root);
    for (const source of [MAIN, ...COPYBOOKS])
      assert.deepStrictEqual(vscode.languages.getDiagnostics(uri_of(source)), [], source);
    assert.ok(vscode.languages.getDiagnostics(uri_of(other)).length > 0, 'not built: the messages of its last compile stay');
  });


  test('opening a source loads its messages: after the start the whole build list, then the shown build', async () => {
    const root = CompileDiagnostics.evfevent_root() ?? '';
    const compile_list_file = path.join(Workspace.get_workspace(), AppConfig.get_app_config().general['compile-list']);
    await fse.copy(path.join(FIXTURES, 'NESTED_COPYBOOK.PGM.evfevent'), path.join(root, MAIN));
    await fse.outputJson(compile_list_file, { compiles: [{ sources: [{ source: MAIN, status: 'failed', cmds: [{ cmd: 'CRTBNDRPG', status: 'failed' }] }] }] });
    const opened = (source: string) => CompileDiagnostics.document_opened({ uri: uri_of(source) } as vscode.TextDocument);

    // As after a window reload: nothing in memory
    CompileDiagnostics.reset();
    opened('barry/qrpglesrc/typical.rpgle.pgm');   // any source: loads the build list once, copybooks included
    assert.strictEqual(vscode.languages.getDiagnostics(uri_of(MAIN)).length, 7);
    assert.deepStrictEqual(lines_of('display/qprotsrc/constants.rpgle'), [3, 4]);

    // The EVFEVENT file changed (e.g. results downloaded again): opening the source reads it again
    await fse.copy(path.join(FIXTURES, 'TYPICAL.PGM.evfevent'), path.join(root, MAIN));
    opened(MAIN);
    assert.ok(vscode.languages.getDiagnostics(uri_of(MAIN)).every(m => m.range.start.line === 0));
    assert.deepStrictEqual(vscode.languages.getDiagnostics(uri_of('display/qprotsrc/constants.rpgle')), [], 'replaced with the new messages');

    // Files outside the source folder are ignored; after Clear, opening doesn't bring them back
    CompileDiagnostics.document_opened({ uri: vscode.Uri.file(compile_list_file) } as vscode.TextDocument);
    CompileDiagnostics.clear();
    opened(MAIN);
    assert.deepStrictEqual(vscode.languages.getDiagnostics(uri_of(MAIN)), []);
  });


  test('history folders contain the events below .obi/tmp', () => {
    assert.strictEqual(CompileDiagnostics.evfevent_root('.obi/build-history/x'), path.join(Workspace.get_workspace(), '.obi', 'build-history', 'x', 'evfevent'));
  });
});
