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
});
