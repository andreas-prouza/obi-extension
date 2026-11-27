import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ProjectState } from '../../extension/ProjectState';
import { OBITools } from '../../extension/utilities/OBITools';
import { Workspace } from '../../extension/utilities/Workspace';
import { AppConfig } from '../../extension/config/AppConfig';
import { Constants } from '../../shared/Constants';
import { set_chosen_folder } from '../../extension/utilities/ObiFolder';
import { PROJECT_FOLDER_KEY, switch_project_folder } from '../../extension/utilities/ProjectFolderSwitch';
import { OperationLock } from '../../extension/utilities/OperationLock';


suite('Multi-root workspaces', () => {

  let root: string;

  function folder(name: string, project: boolean): vscode.WorkspaceFolder {
    const dir = path.join(root, name);
    fs.mkdirSync(path.join(dir, '.obi/etc'), { recursive: true });
    if (project)
      fs.writeFileSync(path.join(dir, Constants.OBI_APP_CONFIG_FILE), '');
    return { uri: vscode.Uri.file(dir), name, index: 0 };
  }

  const open = (...folders: vscode.WorkspaceFolder[]) => sinon.stub(vscode.workspace, 'workspaceFolders').get(() => folders);

  setup(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-multi-root-'));
  });

  teardown(() => {
    sinon.restore();
    set_chosen_folder(undefined);
    fs.rmSync(root, { recursive: true, force: true });
  });


  test('OBI works with the first folder that has a project', () => {
    const other = folder('other', false);
    const project = folder('project', true);
    open(other, project);

    assert.strictEqual(Workspace.get_workspace(), project.uri.fsPath);
    assert.strictEqual(Workspace.get_workspace_uri().fsPath, project.uri.fsPath);
    assert.strictEqual(OBITools.contains_obi_project(), true);
  });


  test('without a project: the first folder, for Initialize', () => {
    const first = folder('first', false);
    open(first, folder('second', false));

    assert.strictEqual(Workspace.get_workspace(), first.uri.fsPath);
    assert.strictEqual(OBITools.contains_obi_project(), false);
  });


  test('several projects: the first one is used, and OBI says so once', async () => {
    const first = folder('first', true);
    open(first, folder('second', true));
    assert.strictEqual(Workspace.get_workspace(), first.uri.fsPath);

    sinon.stub(OBITools, 'self_check');
    sinon.stub(OBITools, 'without_local_obi').returns(true);
    sinon.stub(AppConfig, 'get_app_config').returns({ attributes_missing: () => false } as unknown as AppConfig);
    sinon.stub(vscode.commands, 'executeCommand').resolves(undefined);
    const info = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    (ProjectState as unknown as Record<string, boolean>)['several_projects_shown'] = false;
    ProjectState.init({ subscriptions: [] } as unknown as vscode.ExtensionContext, { on_project_found: () => undefined, on_valid: () => undefined });

    await ProjectState.update();
    await ProjectState.update();
    assert.strictEqual(info.callCount, 1);
    assert.match(String(info.firstCall.args[0]), /^Several OBI projects found\. OBI works with 'first'/);
  });


  test('several projects: the chosen folder is used; an unknown choice or a single folder ignores it', () => {
    const first = folder('first', true);
    const second = folder('second', true);
    open(first, second, folder('plain', false));

    set_chosen_folder(second.uri.toString());
    assert.strictEqual(Workspace.get_workspace(), second.uri.fsPath);
    set_chosen_folder(vscode.Uri.file(path.join(root, 'gone')).toString());
    assert.strictEqual(Workspace.get_workspace(), first.uri.fsPath);

    sinon.restore();
    open(first);
    set_chosen_folder(second.uri.toString());
    assert.strictEqual(Workspace.get_workspace(), first.uri.fsPath, 'one folder: that one');
  });


  test('Switch project folder: pick, confirm, store, reload; refused while an operation runs', async () => {
    const first = folder('first', true);
    const second = folder('second', true);
    open(first, second);
    const state = new Map<string, unknown>();
    const context = { workspaceState: { get: (key: string) => state.get(key), update: async (key: string, value: unknown) => { state.set(key, value); } } } as unknown as vscode.ExtensionContext;
    const pick = sinon.stub(vscode.window, 'showQuickPick').callsFake(async (items: unknown) => (await (items as Promise<{ folder: vscode.WorkspaceFolder; description?: string }[]> | { folder: vscode.WorkspaceFolder }[]) as { folder: vscode.WorkspaceFolder; description?: string }[]).find(item => item.folder.name === 'second') as unknown as vscode.QuickPickItem);
    const warning = sinon.stub(vscode.window, 'showWarningMessage').resolves('Switch and reload' as unknown as vscode.MessageItem);
    const command = sinon.stub(vscode.commands, 'executeCommand').resolves(undefined);

    // The current one is marked
    const items = await (async () => { await switch_project_folder(context); return pick.firstCall.args[0] as unknown as { label: string; description?: string }[]; })();
    assert.deepStrictEqual(items.map(item => [item.label, item.description]), [['first', 'current'], ['second', undefined]]);
    assert.strictEqual(state.get(PROJECT_FOLDER_KEY), second.uri.toString());
    assert.ok(command.calledWith('workbench.action.reloadWindow'));

    // Cancelled confirmation: nothing stored
    state.clear();
    command.resetHistory();
    warning.resolves(undefined);
    assert.strictEqual(await switch_project_folder(context), undefined);
    assert.strictEqual(state.size, 0);
    assert.ok(command.notCalled);

    // While a build runs
    warning.resetHistory();
    let finish = () => undefined as void;
    const running = OperationLock.run('Run build', () => new Promise<void>(resolve => { finish = resolve; }));
    try {
      assert.strictEqual(await switch_project_folder(context), undefined);
      assert.match(String(warning.firstCall.args[0]), /Run build is running/);
      assert.strictEqual(state.size, 0);
    }
    finally {
      finish();
      await running;
    }
  });
});
