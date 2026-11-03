import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Constants } from '../../shared/Constants';
import { Workspace } from '../../extension/utilities/Workspace';
import { BuildSummary } from '../../webview/show_changes/BuildSummary';
import { LogOutput } from '../../webview/show_changes/LogOutput';
import { BuildHistoryItem, BuildHistoryProvider } from '../../webview/build_history/BuildHistoryProvider';
import { reset_workspace } from './workspace_fixture';


const fake_webview = { asWebviewUri: (uri: vscode.Uri) => uri, cspSource: 'vscode-resource:' } as unknown as vscode.Webview;


suite('Missing or broken files do not break views', () => {

  setup(async () => {
    await reset_workspace();
  });

  teardown(() => sinon.restore());


  test('build summary without compile-list renders the empty state', () => {
    const html: string = BuildSummary['generate_html'](vscode.Uri.file(Constants.EXTENSION_ROOT), fake_webview);
    assert.ok(html.includes('id="no_compile_list"'));
  });


  test('build summary: unreadable object lists give empty lists', () => {
    const tmp = path.join(Workspace.get_workspace(), Constants.OBI_TMP_DIR);
    fs.mkdirSync(tmp, { recursive: true });
    fs.writeFileSync(path.join(Workspace.get_workspace(), Constants.CHANGED_OBJECT_LIST), '{"new-objects": [');
    fs.writeFileSync(path.join(Workspace.get_workspace(), Constants.DEPENDEND_OBJECT_LIST), '["lib/qrpglesrc/a.rpgle.pgm", 4]');

    const list = BuildSummary['get_object_list'](Workspace.get_workspace_uri());
    assert.deepStrictEqual(list.new_sources, []);
    assert.deepStrictEqual(list.changed_sources, []);
    assert.deepStrictEqual(list.dependend_sources.map((s: { source: string }) => s.source), ['lib/qrpglesrc/a.rpgle.pgm']);
  });


  test('build history: a truncated compile-list.json shows a warning item', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-history-'));
    try {
      const dir = path.join(root, Constants.BUILD_HISTORY_DIR, 'some-build');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'compile-list.json'), '{"compiles": [');

      const build = new BuildHistoryItem('12:00', vscode.TreeItemCollapsibleState.Collapsed, dir, 'build', 'some-build');
      const children = await new BuildHistoryProvider(root).getChildren(build);
      assert.strictEqual(children.length, 1);
      assert.strictEqual(children[0].contextValue, 'buildHistoryWarning');
    }
    finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });


  test('log of an unknown source, level or command is empty', () => {
    const get_compile_list = sinon.stub(BuildSummary, 'get_compile_list').returns({
      timestamp: 'x', compiles: [{ level: 1, sources: [{ source: 'a', cmds: [{ joblog: 'LOG' }] }] }]
    });
    const uri = Workspace.get_workspace_uri();

    assert.strictEqual(LogOutput.get_log_content(uri, 'joblog', 1, 'a', 0), 'LOG');
    assert.strictEqual(LogOutput.get_log_content(uri, 'joblog', 1, 'unknown', 0), '');
    assert.strictEqual(LogOutput.get_log_content(uri, 'joblog', 2, 'a', 0), '');
    assert.strictEqual(LogOutput.get_log_content(uri, 'joblog', 1, 'a', 3), '');

    get_compile_list.returns(undefined);
    assert.strictEqual(LogOutput.get_log_content(uri, 'joblog', 1, 'a', 0), '');
  });
});
