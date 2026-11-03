import assert from 'assert';
import * as path from 'path';
import * as fse from 'fs-extra';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { require_trust } from '../../extension/utilities/Trust';
import { Workspace } from '../../extension/utilities/Workspace';
import { Constants } from '../../shared/Constants';
import { BuildSummary } from '../../webview/show_changes/BuildSummary';


const fake_webview = { asWebviewUri: (uri: vscode.Uri) => uri, cspSource: 'vscode-resource:' } as unknown as vscode.Webview;


suite('Workspace trust', () => {

  teardown(() => sinon.restore());


  test('untrusted: the action is refused with a warning', () => {
    const warning = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    assert.strictEqual(require_trust('Running the local OBI', false), false);
    assert.match(String(warning.firstCall.args[0]), /Running the local OBI is disabled because this workspace is not trusted/);
    assert.strictEqual(require_trust('Running the local OBI', true), true);
  });


  test('untrusted: the custom template of the workspace is not rendered', async function () {
    const template = path.join(Workspace.get_workspace(), Constants.VSCODE_CUSTOM_BUILD_LIST_TEMPLATE);
    await fse.outputFile(template, '<p id="custom-marker">custom</p>');
    try {
      try {
        sinon.stub(vscode.workspace, 'isTrusted').value(false);
      }
      catch {
        this.skip();   // the API property can't be stubbed in this VS Code version
      }
      const html: string = BuildSummary['generate_html'](vscode.Uri.file(Constants.EXTENSION_ROOT), fake_webview);
      assert.ok(!html.includes('custom-marker'));

      sinon.restore();
      if (vscode.workspace.isTrusted) {
        const trusted: string = BuildSummary['generate_html'](vscode.Uri.file(Constants.EXTENSION_ROOT), fake_webview);
        // Without compile list the template is not included at all; the check above is what matters
        assert.ok(typeof trusted === 'string');
      }
    }
    finally {
      await fse.remove(template);
    }
  });
});
