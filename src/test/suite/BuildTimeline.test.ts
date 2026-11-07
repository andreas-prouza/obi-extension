import assert from 'assert';
import * as path from 'path';
import * as fse from 'fs-extra';
import * as vscode from 'vscode';
import { Workspace } from '../../extension/utilities/Workspace';
import { AppConfig } from '../../extension/config/AppConfig';
import { DirTool } from '../../extension/utilities/DirTool';
import { CompileDiagnostics } from '../../extension/source/CompileDiagnostics';
import { Constants } from '../../shared/Constants';
import { BuildIndex } from '../../webview/build_history/BuildIndex';
import { md5_file } from '../../extension/obi/compile_list/modules/source_hashes';
import { BuildTimeline } from '../../webview/timeline/BuildTimeline';
import { ObiTimelineTriggerKind, TimelineApi, timeline_api } from '../../webview/timeline/TimelineApi';
import { reset_workspace } from './workspace_fixture';


const SOURCE = 'prouzalib/qrpglesrc/timeline.rpgle';
const OTHER = 'prouzalib/qclsrc/other.clle';
const OLD = '2026-11-06T10.00.00.000Z';
const NEW = '2026-11-07T10.00.00.000Z';
const EVFEVENTS = path.resolve(__dirname, '../../../test-resources/evfevent');

const options = { triggerKind: ObiTimelineTriggerKind.Automatic };
const token = new vscode.CancellationTokenSource().token;
const uri_of = (source: string) => vscode.Uri.file(path.join(DirTool.get_local_source_dir(), source));


async function write_build(dir: string, sources: { source: string; status: 'success' | 'failed'; hash?: string }[]): Promise<void> {
  const compiles = [{ level: 1, sources: sources.map(source => ({ source: source.source, hash: source.hash, cmds: [{ cmd: `CRTBNDRPG ${source.source}`, status: source.status }] })) }];
  await fse.outputJson(path.join(Workspace.get_workspace(), Constants.BUILD_HISTORY_DIR, dir, 'compile-list.json'), { timestamp: dir, compiles });
}


suite('Build history in the Timeline view', () => {

  let api: TimelineApi | undefined;

  suiteSetup(function () {
    api = timeline_api();
    // Stable from VS Code 1.145: the job with the minimum version (1.90) checks that nothing breaks without it
    if (!api)
      this.skip();
  });

  setup(async () => {
    await reset_workspace();
    AppConfig.reset();
    BuildIndex.reset();
    await fse.outputFile(path.join(DirTool.get_local_source_dir(), SOURCE), '**free\n');
    const hash = await md5_file(path.join(DirTool.get_local_source_dir(), SOURCE));
    await write_build(OLD, [{ source: SOURCE, status: 'success', hash }]);
    await write_build(NEW, [{ source: SOURCE, status: 'failed', hash: 'older content' }, { source: OTHER, status: 'success' }]);
  });

  // The commands run in the extension bundle, which has its own CompileDiagnostics: clear through its command
  teardown(() => vscode.commands.executeCommand('obi.clearDiagnostics'));


  test('a source: its builds, newest first, with status and current version', async () => {
    const timeline = new BuildTimeline(api!);
    const result = await timeline.provideTimeline(uri_of(SOURCE), options, token);
    assert.ok(result);
    assert.deepStrictEqual(result.items.map(item => item.id), [`${NEW}:${SOURCE}`, `${OLD}:${SOURCE}`]);
    assert.ok(result.items[0] instanceof (vscode as unknown as { TimelineItem: new (...args: never[]) => object }).TimelineItem, 'created with vscode.TimelineItem');
    assert.deepStrictEqual(result.items.map(item => item.contextValue), ['obi.build.source', 'obi.build.source']);
    assert.ok(result.items[0].timestamp > result.items[1].timestamp);
    assert.strictEqual(result.items[0].iconPath?.id, 'error');
    assert.strictEqual(result.items[1].iconPath?.id, 'pass');
    assert.match(result.items[1].description ?? '', /current version|aktuelle Version/);
    assert.doesNotMatch(result.items[0].description ?? '', /current version|aktuelle Version/);
    assert.strictEqual(result.items[0].command?.command, 'obi.open_build_summary');
    timeline.dispose();
  });

  test('paging, folders, workspace and files outside the source folder', async () => {
    const timeline = new BuildTimeline(api!);

    const first = await timeline.provideTimeline(uri_of(SOURCE), { ...options, limit: 1 }, token);
    assert.strictEqual(first?.items.length, 1);
    const rest = await timeline.provideTimeline(uri_of(SOURCE), { ...options, limit: 1, cursor: first?.cursor }, token);
    assert.deepStrictEqual(rest?.items.map(item => item.id), [`${OLD}:${SOURCE}`]);
    assert.strictEqual(rest?.cursor, undefined);

    const folder = await timeline.provideTimeline(vscode.Uri.file(path.join(DirTool.get_local_source_dir(), 'prouzalib/qrpglesrc')), options, token);
    assert.deepStrictEqual(folder?.items.map(item => item.id), [`${NEW}:prouzalib/qrpglesrc`, `${OLD}:prouzalib/qrpglesrc`]);

    const workspace = await timeline.provideWorkspaceTimeline(options, token);
    assert.deepStrictEqual(workspace?.items.map(item => item.id), [NEW, OLD]);
    assert.deepStrictEqual(workspace?.items.map(item => item.contextValue), ['obi.build', 'obi.build']);

    assert.strictEqual(await timeline.provideTimeline(vscode.Uri.file(path.join(Workspace.get_workspace(), '.obi', 'etc', 'app-config.toml')), options, token), undefined);
    assert.strictEqual(await timeline.provideTimeline(vscode.Uri.parse('untitled:Untitled-1'), options, token), undefined);
    timeline.dispose();
  });

  test('change events after a history change', async () => {
    const timeline = new BuildTimeline(api!);
    const fired: string[] = [];
    timeline.onDidChangeTimeline(uri => fired.push(`file:${uri === undefined ? 'all' : 'some'}`));
    timeline.onDidChangeWorkspaceTimeline(() => fired.push('workspace'));
    const subscription = BuildIndex.on_changed(() => timeline.changed());
    BuildIndex.changed();
    subscription.dispose();
    timeline.dispose();
    assert.deepStrictEqual(fired, ['file:all', 'workspace']);
  });

  test('compile messages of a history build into the Problems view', async () => {
    const history = path.join(Workspace.get_workspace(), Constants.BUILD_HISTORY_DIR, NEW);
    const evfevent_root = CompileDiagnostics.evfevent_root(path.join(Constants.BUILD_HISTORY_DIR, NEW));
    assert.ok(evfevent_root && evfevent_root.startsWith(history));
    await fse.copy(path.join(EVFEVENTS, 'NESTED_COPYBOOK.PGM.evfevent'), path.join(evfevent_root, SOURCE));

    await vscode.commands.executeCommand('obi.timeline.show-compile-messages', { id: `${NEW}:${SOURCE}` });
    assert.ok(vscode.languages.getDiagnostics(uri_of(SOURCE)).length > 0);

    // Ids that aren't builds of this history are ignored
    await vscode.commands.executeCommand('obi.clearDiagnostics');
    await vscode.commands.executeCommand('obi.timeline.show-compile-messages', { id: `../${NEW}:${SOURCE}` });
    await vscode.commands.executeCommand('obi.timeline.show-compile-messages', { id: 42 });
    await vscode.commands.executeCommand('obi.timeline.delete-build', { id: '..' });
    assert.deepStrictEqual(vscode.languages.getDiagnostics(uri_of(SOURCE)), []);
    assert.ok(await fse.pathExists(history));
  });
});
