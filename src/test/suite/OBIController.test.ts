import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Constants } from '../../shared/Constants';
import { OBIController } from '../../webview/controller/OBIController';
import { OperationLock } from '../../extension/utilities/OperationLock';
import { AppConfig } from '../../extension/config/AppConfig';
import { OBITools } from '../../extension/utilities/OBITools';
import { Workspace } from '../../extension/utilities/Workspace';


/** Minimal WebviewView stand-in that records message listeners. */
function fake_view() {
  const listeners: ((message: unknown) => void)[] = [];
  const webview = {
    options: {},
    html: '',
    cspSource: 'vscode-resource:',
    asWebviewUri: (uri: vscode.Uri) => uri,
    posted: [] as Record<string, unknown>[],
    postMessage: async function (message: Record<string, unknown>) { this.posted.push(message); return true; },
    onDidReceiveMessage: (listener: (message: unknown) => void) => {
      listeners.push(listener);
      return { dispose: () => { const i = listeners.indexOf(listener); if (i >= 0) listeners.splice(i, 1); } };
    }
  };
  const view = { webview, onDidDispose: () => ({ dispose: () => undefined }) } as unknown as vscode.WebviewView;
  return { view, webview, listeners };
}


suite('OBI Build view', () => {

  teardown(() => sinon.restore());

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
      assert.match(webview.html, /<body class="obi-page obi-view is-running">/);
    });
  });


  test('the page has no components of the old toolkit; the switch starts on "Current source"', () => {
    const { view, webview } = fake_view();
    new OBIController(vscode.Uri.file(Constants.EXTENSION_ROOT)).resolveWebviewView(view, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);
    assert.ok(!/<vscode-/.test(webview.html));
    assert.match(webview.html, /<button type="button" class="seg-option" role="radio" data-value="single" aria-checked="true"/);
    assert.match(webview.html, /<select id="drp_use_profile" class="obi-select"/);
  });


  test('the delete button is disabled for the default profile only', () => {
    const settings = sinon.stub(Workspace, 'get_workspace_settings').returns({});
    const html_with = () => {
      const { view, webview } = fake_view();
      new OBIController(vscode.Uri.file(Constants.EXTENSION_ROOT)).resolveWebviewView(view, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);
      return webview.html;
    };
    assert.match(html_with(), /id="btn_delete_current_profile" disabled/);
    settings.returns({ current_profile: 'dev' });
    assert.match(html_with(), /id="btn_delete_current_profile" title=/);
  });


  test('the view gets the last build and the source "Current source" builds', () => {
    const { view, webview } = fake_view();
    sinon.stub(AppConfig, 'attributes_missing').returns(false);
    const list = sinon.stub(OBITools, 'get_compile_list');
    new OBIController(vscode.Uri.file(Constants.EXTENSION_ROOT)).resolveWebviewView(view, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);
    const last_build = () => webview.posted.filter(message => message.command === 'update_build_summary_timestamp').at(-1)?.last_build as { kind: string; text: string } | undefined;
    const timestamp = new Date();
    timestamp.setHours(10, 40, 0, 0);
    const cmds = (status: string) => [{ cmd: 'X', status: status }];

    list.returns({ timestamp: timestamp.toISOString(), compiles: [{ level: 1, sources: [{ source: 'a', cmds: cmds('success') }, { source: 'b', cmds: cmds('failed') }] }] });
    OBIController.update_build_summary_timestamp();
    assert.strictEqual(last_build()?.kind, 'failed');
    assert.match(last_build()?.text ?? '', /^Last build .+ · 1 of 2 failed$/);

    list.returns({ timestamp: timestamp.toISOString(), compiles: [{ level: 1, sources: [{ source: 'a', cmds: cmds('success') }] }] });
    OBIController.update_build_summary_timestamp();
    assert.match(last_build()?.text ?? '', /^Last build .+ · all 1 built$/);

    list.returns({ timestamp: timestamp.toISOString(), compiles: [{ level: 1, sources: [{ source: 'a', cmds: cmds('new') }] }] });
    OBIController.update_build_summary_timestamp();
    assert.deepStrictEqual(last_build()?.kind, 'open');

    list.returns(undefined);
    OBIController.update_build_summary_timestamp();
    assert.strictEqual(last_build(), undefined, 'no build list: no line');

    OBIController.post_current_source();
    const current = webview.posted.filter(message => message.command === 'current_source').at(-1);
    assert.strictEqual(current?.none, 'No source open');
  });


  test('"Open" of the last build opens the build summary', async () => {
    const { view, listeners } = fake_view();
    new OBIController(vscode.Uri.file(Constants.EXTENSION_ROOT)).resolveWebviewView(view, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);
    const execute = sinon.stub(vscode.commands, 'executeCommand').resolves(undefined);
    listeners[0]({ command: 'open_build_summary' });
    assert.ok(execute.calledWith('obi.open_build_summary'));
  });
});
