import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Constants } from '../../shared/Constants';
import { Workspace } from '../../extension/utilities/Workspace';
import { reset_workspace } from './workspace_fixture';


suite('JSON schemas in the editor', () => {

  setup(async () => {
    await reset_workspace();
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });


  test('a mistake in dependency.json is shown as a problem', async function () {
    this.timeout(30000);
    const file = path.join(Workspace.get_workspace(), Constants.DEPENDENCY_LIST);
    fs.writeFileSync(file, '{ "mylib/qrpglesrc/hello.rpgle.pgm": "not a list" }\n');
    const document = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(document);

    let problems: vscode.Diagnostic[] = [];
    for (let i = 0; i < 100 && problems.length === 0; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      problems = vscode.languages.getDiagnostics(document.uri);
    }
    assert.ok(problems.some(problem => /array/i.test(problem.message)), JSON.stringify(problems.map(problem => problem.message)));
  });
});
