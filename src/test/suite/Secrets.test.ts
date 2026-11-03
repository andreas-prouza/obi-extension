import assert from 'assert';
import * as vscode from 'vscode';
import { Constants } from '../../shared/Constants';
import { OBIConfiguration } from '../../webview/controller/OBIConfiguration';


const SECRET = 'TopSecret-4711';

/** Minimal stand-ins: generate_html only needs secrets.get, workspaceState.get and asWebviewUri. */
function fake_context(stored: string | undefined, ui_state: Record<string, string> = {}): vscode.ExtensionContext {
  return {
    secrets: { get: async () => stored },
    workspaceState: { get: (key: string) => ui_state[key] }
  } as unknown as vscode.ExtensionContext;
}

const fake_webview = { asWebviewUri: (uri: vscode.Uri) => uri, cspSource: 'vscode-resource:' } as unknown as vscode.Webview;


suite('Config page does not expose secrets', () => {

  test('a stored SSH password is not rendered into the page', async () => {
    const html: string = await OBIConfiguration['generate_html'](fake_context(SECRET), vscode.Uri.file(Constants.EXTENSION_ROOT), fake_webview);
    assert.ok(!html.includes(SECRET), 'password must not appear in the HTML');
    assert.ok(html.includes('id="delete_ssh_password"'), 'remove button shown when a password is stored');
  });


  test('no remove button without a stored password', async () => {
    const html: string = await OBIConfiguration['generate_html'](fake_context(undefined), vscode.Uri.file(Constants.EXTENSION_ROOT), fake_webview);
    assert.ok(!html.includes('id="delete_ssh_password"'));
  });


  test('selected tab comes from workspaceState; invalid values fall back to defaults', async () => {
    const valid = await OBIConfiguration['generate_html'](fake_context(undefined, { 'obi.config.panel': 'user_cfg', 'obi.config.panel_tab': 'tab-3' }), vscode.Uri.file(Constants.EXTENSION_ROOT), fake_webview);
    assert.ok(valid.includes('data-panel="user_cfg" data-panel-tab="tab-3"'));

    const injected = await OBIConfiguration['generate_html'](fake_context(undefined, { 'obi.config.panel': '";alert(1);//' }), vscode.Uri.file(Constants.EXTENSION_ROOT), fake_webview);
    assert.ok(!injected.includes('alert(1)'));
    assert.ok(injected.includes('data-panel="project_cfg"'));
  });
});


suite('Webview pages set a Content-Security-Policy', () => {

  test('configuration page: CSP with the nonce of its module script, no inline script', async () => {
    const html: string = await OBIConfiguration['generate_html'](fake_context(undefined), vscode.Uri.file(Constants.EXTENSION_ROOT), fake_webview);

    const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
    assert.ok(csp, 'CSP meta tag');
    assert.match(csp[1], /default-src 'none'/);
    const nonce = csp[1].match(/'nonce-([^']+)'/)?.[1];
    assert.ok(nonce && html.includes(`<script type="module" nonce="${nonce}"`), 'module script carries the CSP nonce');
    assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/.test(html), 'no inline script');
    assert.match(html, /<body data-panel="project_cfg" data-panel-tab="tab-1">/);
  });
});
