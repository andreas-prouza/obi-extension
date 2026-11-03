import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Constants } from '../../shared/Constants';
import { Workspace } from '../../extension/utilities/Workspace';
import { BuildHistoryItem, BuildHistoryProvider } from '../../webview/build_history/BuildHistoryProvider';
import { local_date_label } from '../../webview/build_history/HistoryTimestamp';
import { reset_workspace } from './workspace_fixture';


const history = () => path.join(Workspace.get_workspace(), Constants.BUILD_HISTORY_DIR);

/** Build folders, `days_ago` per build; returns the folder names */
function create_builds(...days_ago: number[]): string[] {
  return days_ago.map(days => {
    const dir = BuildHistoryProvider.date2escaped_date(new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());
    fs.mkdirSync(path.join(history(), dir), { recursive: true });
    fs.writeFileSync(path.join(history(), dir, 'compile-list.json'), '{"compiles": []}');
    return dir;
  });
}

function memento(values: Record<string, unknown> = {}): vscode.Memento {
  return {
    keys: () => Object.keys(values),
    get: <T>(key: string) => values[key] as T,
    update: async (key: string, value: unknown) => { values[key] = value; }
  } as vscode.Memento;
}

const remaining = () => fs.readdirSync(history()).sort();


suite('Build history retention', () => {

  setup(async () => {
    await reset_workspace();
  });

  teardown(async () => {
    sinon.restore();
    await vscode.workspace.getConfiguration('obi.buildHistory').update('maxBuilds', undefined, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('obi.buildHistory').update('maxAgeDays', undefined, vscode.ConfigurationTarget.Global);
  });


  test('a configured limit deletes the oldest builds, never the new build or folders without timestamp', async () => {
    await vscode.workspace.getConfiguration('obi.buildHistory').update('maxBuilds', 2, vscode.ConfigurationTarget.Global);
    BuildHistoryProvider.init_retention(memento());
    const [newest, second, old, oldest] = create_builds(0, 1, 2, 3);
    fs.mkdirSync(path.join(history(), 'my-notes'));

    assert.strictEqual(await BuildHistoryProvider.apply_retention(oldest), 1);
    assert.deepStrictEqual(remaining(), [newest, second, oldest, 'my-notes'].sort());
    assert.ok(!remaining().includes(old));
  });


  test('max age', async () => {
    await vscode.workspace.getConfiguration('obi.buildHistory').update('maxBuilds', 0, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('obi.buildHistory').update('maxAgeDays', 5, vscode.ConfigurationTarget.Global);
    BuildHistoryProvider.init_retention(memento());
    const [recent] = create_builds(1, 10, 20);

    assert.strictEqual(await BuildHistoryProvider.apply_retention(), 2);
    assert.deepStrictEqual(remaining(), [recent]);
  });


  test('without a configured limit, existing history is only deleted after asking once', async () => {
    const dirs = create_builds(...Array.from({ length: 102 }, (_, i) => i));
    const ask = sinon.stub(vscode.window, 'showInformationMessage');

    // "Keep all": nothing deleted, never asked again
    ask.resolves('Keep all' as unknown as vscode.MessageItem);
    const keep_state = memento();
    BuildHistoryProvider.init_retention(keep_state);
    assert.strictEqual(await BuildHistoryProvider.apply_retention(), 0);
    assert.strictEqual(await BuildHistoryProvider.apply_retention(), 0);
    assert.strictEqual(ask.callCount, 1);
    assert.strictEqual(keep_state.get('obi.buildHistory.retention'), 'keep');
    assert.strictEqual(remaining().length, 102);

    // "Delete old builds": the 2 oldest beyond the default of 100 are deleted
    ask.resetHistory();
    ask.resolves('Delete old builds' as unknown as vscode.MessageItem);
    BuildHistoryProvider.init_retention(memento());
    assert.strictEqual(await BuildHistoryProvider.apply_retention(), 2);
    assert.ok(!remaining().includes(dirs[100]) && !remaining().includes(dirs[101]));
    assert.strictEqual(ask.callCount, 1);
  });


  suite('deleting from the view asks first', () => {

    let handlers: Map<string, (...args: unknown[]) => unknown>;
    let confirm: sinon.SinonStub;

    setup(() => {
      handlers = new Map();
      // The activated extension has registered the commands already
      sinon.stub(vscode.commands, 'registerCommand').callsFake((id: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(id, handler);
        return { dispose: () => undefined };
      });
      sinon.stub(vscode.window, 'createTreeView').returns({ dispose: () => undefined } as unknown as vscode.TreeView<BuildHistoryItem>);
      const context = { subscriptions: [] as vscode.Disposable[] } as unknown as vscode.ExtensionContext;
      new BuildHistoryProvider(Workspace.get_workspace()).register(context);
      confirm = sinon.stub(vscode.window, 'showWarningMessage');
    });


    test('delete all', async () => {
      create_builds(0, 1, 2);
      confirm.resolves(undefined);
      await handlers.get('obi.build-history.delete-all')!();
      assert.strictEqual(remaining().length, 3, 'cancelled');
      assert.match(String(confirm.firstCall.args[0]), /^Delete all 3 builds \(\d+ KB\)\?$/);
      assert.deepStrictEqual(confirm.firstCall.args[1], { modal: true });

      confirm.resolves('Delete' as unknown as vscode.MessageItem);
      await handlers.get('obi.build-history.delete-all')!();
      assert.deepStrictEqual(remaining(), []);
    });


    test('delete a date and a build', async () => {
      const [today, yesterday] = create_builds(0, 1);
      const date_item = new BuildHistoryItem(local_date_label(new Date()), vscode.TreeItemCollapsibleState.Collapsed, '', 'date');
      const build_item = new BuildHistoryItem('12:00:00', vscode.TreeItemCollapsibleState.Collapsed, path.join(history(), yesterday), 'build', yesterday, 'yesterday');

      confirm.resolves(undefined);
      await handlers.get('obi.build-history.delete-date')!(date_item);
      await handlers.get('obi.build-history.delete-item')!(build_item);
      assert.deepStrictEqual(remaining(), [today, yesterday].sort());
      assert.strictEqual(confirm.firstCall.args[0], `Delete the build of ${local_date_label(new Date())}?`);
      assert.strictEqual(confirm.secondCall.args[0], 'Delete build yesterday 12:00:00?');

      confirm.resolves('Delete' as unknown as vscode.MessageItem);
      await handlers.get('obi.build-history.delete-date')!(date_item);
      await handlers.get('obi.build-history.delete-item')!(build_item);
      assert.deepStrictEqual(remaining(), []);
    });
  });
});
