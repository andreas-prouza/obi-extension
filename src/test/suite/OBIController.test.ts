import assert from 'assert';
import * as vscode from 'vscode';
import { Constants } from '../../shared/Constants';
import { OBIController } from '../../webview/controller/OBIController';
import { OperationLock } from '../../extension/utilities/OperationLock';


/** Minimal WebviewView stand-in that records message listeners. */
function fake_view() {
  const listeners: ((message: unknown) => void)[] = [];
  const webview = {
    options: {},
    html: '',
    cspSource: 'vscode-resource:',
    asWebviewUri: (uri: vscode.Uri) => uri,
    postMessage: async () => true,
    onDidReceiveMessage: (listener: (message: unknown) => void) => {
      listeners.push(listener);
      return { dispose: () => { const i = listeners.indexOf(listener); if (i >= 0) listeners.splice(i, 1); } };
    }
  };
  const view = { webview, onDidDispose: () => ({ dispose: () => undefined }) } as unknown as vscode.WebviewView;
  return { view, webview, listeners };
}


suite('OBI Build view', () => {

  test('resolving the same view twice keeps exactly one message listener', () => {
    const { view, listeners } = fake_view();
    const controller = new OBIController(vscode.Uri.file(Constants.EXTENSION_ROOT));
    const context = {} as vscode.WebviewViewResolveContext;
    const token = {} as vscode.CancellationToken;

    controller.resolveWebviewView(view, context, token);
    controller.resolveWebviewView(view, context, token);
    assert.strictEqual(listeners.length, 1);
  });


  test('a render during a running operation shows the busy indicator', async () => {
    const { view, webview } = fake_view();
    const controller = new OBIController(vscode.Uri.file(Constants.EXTENSION_ROOT));
    controller.resolveWebviewView(view, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);
    assert.ok(webview.html.includes('id="running_ring" style="display: none"'));

    await OperationLock.run('Run build', async () => {
      await OBIController.update();
      assert.ok(webview.html.includes('id="running_ring" style="display: flex" title="Run build"'));
    });
  });
});
