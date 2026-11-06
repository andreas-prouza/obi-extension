import assert from 'assert';
import * as http from 'http';
import * as path from 'path';
import * as fse from 'fs-extra';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AddressInfo } from 'net';
import { AppConfig } from '../../extension/config/AppConfig';
import { OBITools } from '../../extension/utilities/OBITools';
import { Workspace } from '../../extension/utilities/Workspace';
import { Constants } from '../../shared/Constants';
import { DeploymentConfig } from '../../webview/deployment/DeploymentConfig';
import { BuildSummary } from '../../webview/show_changes/BuildSummary';
import { reset_workspace } from './workspace_fixture';


const fake_webview = { asWebviewUri: (uri: vscode.Uri) => uri, cspSource: 'vscode-resource:' } as unknown as vscode.Webview;

function completed_list(custom_data?: Record<string, unknown>): Record<string, unknown> {
  return {
    timestamp: '2026-11-04T10:00:00.000000',
    compiles: [{ level: 1, sources: [{ source: 'lib/qrpglesrc/a.rpgle.pgm', cmds: [{ cmd: 'CRTBNDRPG', status: 'success', joblog: 'LOG', stdout: 'SPOOL' }] }] }],
    ...(custom_data ? { custom_data: custom_data } : {})
  };
}

function render(): string {
  return BuildSummary['generate_html'](vscode.Uri.file(Constants.EXTENSION_ROOT), fake_webview);
}

async function deployment_toml(text: string): Promise<void> {
  await fse.outputFile(path.join(Workspace.get_workspace(), Constants.DEPLOYMENT_CONFIG_FILE), text);
}


interface Received { method?: string; url?: string; authorization?: string; body: string }

/** Local i-Releaser with two workflows; start_workflow creates deployment 123 */
async function i_releaser(): Promise<{ url: string; received: Received[]; close: () => Promise<void> }> {
  const received: Received[] = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, authorization: req.headers['authorization'], body: body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.url === '/api/get_workflows')
        res.end(JSON.stringify([{ name: 'Deploy OBI Build Test' }, { name: 'Deploy OBI Build' }]));
      else
        res.end(JSON.stringify({ status: 'success', meta_file: { general: { id: 123, project: 'erp', deploy_version: 7 } } }));
    });
  });
  await new Promise<void>(resolve => srv.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  return { url: url, received: received, close: () => new Promise(resolve => srv.close(() => resolve())) };
}


suite('i-Releaser deployment from the build summary', () => {

  let secrets: Map<string, string>;
  let context: vscode.ExtensionContext | undefined;

  setup(async () => {
    await reset_workspace();
    // The fixture has no remote host: without it the summary shows no compile list
    sinon.stub(AppConfig, 'attributes_missing').returns(false);
    secrets = new Map();
    context = OBITools.ext_context;
    OBITools.ext_context = {
      secrets: {
        get: async (key: string) => secrets.get(key),
        store: async (key: string, value: string) => { secrets.set(key, value); },
        delete: async (key: string) => { secrets.delete(key); }
      }
    } as unknown as vscode.ExtensionContext;
  });

  teardown(() => {
    sinon.restore();
    OBITools.ext_context = context;
  });


  test('the button only with an i-Releaser URL and a completed build', async () => {
    sinon.stub(BuildSummary, 'get_compile_list').callsFake(() => completed_list());
    assert.ok(!render().includes('id="start_deployment"'), 'no deployment.toml');

    await deployment_toml('[i-releaser]\nurl = "javascript:alert(1)"\n');
    assert.ok(!render().includes('id="start_deployment"'), 'no http(s) URL');

    await deployment_toml('[i-releaser]\nurl = "http://athoed40:8011/"\n');
    assert.ok(render().includes('id="start_deployment"'));

    sinon.restore();
    sinon.stub(AppConfig, 'attributes_missing').returns(false);
    const unfinished = completed_list();
    (unfinished.compiles as { sources: { cmds: { status: string }[] }[] }[])[0].sources[0].cmds[0].status = 'failed';
    sinon.stub(BuildSummary, 'get_compile_list').returns(unfinished);
    assert.ok(!render().includes('id="start_deployment"'), 'build not completed');
  });


  test('the link to the deployment of the build list, also when a custom template stored it', async () => {
    await deployment_toml('[i-releaser]\nurl = "http://athoed40:8011"\n');
    const list = sinon.stub(BuildSummary, 'get_compile_list');

    list.returns(completed_list({ 'i-releaser': { id: 123, workflow: 'wf' } }));
    assert.ok(render().includes('href="http://athoed40:8011/show_details/123"'));

    list.returns(completed_list({ json: { meta_file: { general: { id: 77 } } } }));
    assert.ok(render().includes('href="http://athoed40:8011/show_details/77"'));

    list.returns(completed_list());
    assert.ok(!render().includes('i_releaser_deployment'));
  });


  test('start: the build list without joblogs goes to i-Releaser, the deployment into the build list', async () => {
    const ir = await i_releaser();
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\ndefault-workflow = "Deploy OBI Build"\n`);
      assert.ok(await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1'));
      sinon.stub(BuildSummary, 'get_compile_list').callsFake(() => completed_list({ ticket: 'ABC-1' }));
      const write = sinon.stub(OBITools, 'write_compile_list');
      sinon.stub(BuildSummary, 'update').resolves();
      const pick = sinon.stub(vscode.window, 'showQuickPick').callsFake(async items => (items as vscode.QuickPickItem[])[0]);
      const info = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);

      await BuildSummary.start_deployment();

      // The default workflow is offered first
      assert.deepStrictEqual((pick.firstCall.args[0] as vscode.QuickPickItem[]).map(item => item.label), ['Deploy OBI Build', 'Deploy OBI Build Test']);
      assert.deepStrictEqual(ir.received.map(r => `${r.method} ${r.url} ${r.authorization}`),
        ['GET /api/get_workflows Bearer TOKEN-1', 'POST /api/start_workflow/Deploy%20OBI%20Build Bearer TOKEN-1']);
      const sent = JSON.parse(ir.received[1].body);
      assert.deepStrictEqual(sent.custom_data, { ticket: 'ABC-1' });
      assert.deepStrictEqual(sent.compiles[0].sources[0].cmds[0], { cmd: 'CRTBNDRPG', status: 'success' });

      assert.ok(write.calledOnce);
      const written = write.firstCall.args[1] as { custom_data: Record<string, Record<string, unknown>>; compiles: { sources: { cmds: Record<string, unknown>[] }[] }[] };
      assert.strictEqual(write.firstCall.args[0], path.join(Workspace.get_workspace(), BuildSummary.get_current_compile_list_name()));
      assert.deepStrictEqual({ ...written.custom_data['i-releaser'], started: undefined }, { id: 123, workflow: 'Deploy OBI Build', project: 'erp', deploy_version: 7, started: undefined });
      assert.strictEqual(written.custom_data['ticket'], 'ABC-1');
      assert.strictEqual(written.compiles[0].sources[0].cmds[0]['joblog'], 'LOG', 'the build list keeps its joblogs');
      assert.match(String(info.firstCall.args[0]), /Deploy OBI Build.*123/);
    }
    finally {
      await ir.close();
    }
  });


  test('start: nothing is sent without a token for this URL or without a picked workflow', async () => {
    const ir = await i_releaser();
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\n`);
      sinon.stub(BuildSummary, 'get_compile_list').callsFake(() => completed_list());
      const write = sinon.stub(OBITools, 'write_compile_list');
      const error = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);

      // A token of another i-Releaser is not used
      await DeploymentConfig.store_auth_token('http://other.example', 'OTHER');
      await BuildSummary.start_deployment();
      assert.match(String(error.firstCall.args[0]), /No i-Releaser token is stored for/);
      assert.strictEqual(ir.received.length, 0);

      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      sinon.stub(vscode.window, 'showQuickPick').resolves(undefined);
      await BuildSummary.start_deployment();
      assert.deepStrictEqual(ir.received.map(r => r.url), ['/api/get_workflows']);
      assert.ok(write.notCalled);
    }
    finally {
      await ir.close();
    }
  });


  test('start: the workflows of deployment.toml limit the choice', async () => {
    const ir = await i_releaser();
    try {
      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      sinon.stub(BuildSummary, 'get_compile_list').callsFake(() => completed_list());
      const warning = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
      const pick = sinon.stub(vscode.window, 'showQuickPick').resolves(undefined);
      const labels = () => (pick.lastCall.args[0] as vscode.QuickPickItem[]).map(item => item.label);

      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\nworkflows = ["Deploy OBI Build Test"]\n`);
      await BuildSummary.start_deployment();
      assert.deepStrictEqual(labels(), ['Deploy OBI Build Test']);
      assert.ok(warning.notCalled);

      // A name i-Releaser doesn't know is reported, the others are offered
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\nworkflows = ["Deploy OBI Build Test", "Deploy Typo"]\n`);
      await BuildSummary.start_deployment();
      assert.deepStrictEqual(labels(), ['Deploy OBI Build Test']);
      assert.match(String(warning.lastCall.args[0]), /doesn't know these workflows of .*deployment\.toml: Deploy Typo/);

      // None known: nothing to pick
      pick.resetHistory();
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\nworkflows = ["Deploy Typo"]\n`);
      await BuildSummary.start_deployment();
      assert.ok(pick.notCalled);
      assert.match(String(warning.lastCall.args[0]), /Deploy Typo/);
      assert.ok(ir.received.every(r => r.url === '/api/get_workflows'), 'no workflow was started');
    }
    finally {
      await ir.close();
    }
  });


  test('deployment config page: the workflows, one per line', async () => {
    const toml_file = path.join(Workspace.get_workspace(), Constants.DEPLOYMENT_CONFIG_FILE);
    await deployment_toml('[i-releaser]\nurl = "http://athoed40:8011"\nworkflows = ["A", "B"]\n');
    const html = await DeploymentConfig['generate_html'](OBITools.ext_context!, vscode.Uri.file(Constants.EXTENSION_ROOT), fake_webview);
    assert.match(html, /id="i-releaser\|workflows"[^>]*value='A\nB'/);

    const save = (workflows: string[]) => DeploymentConfig['save_config']({
      'i-releaser': { url: 'http://athoed40:8011', 'default-workflow': 'A', workflows: workflows, 'main-branch': '', 'auth-token': '' }
    });
    save([' B ', '', 'C', 'B', '']);
    assert.deepStrictEqual(DeploymentConfig.get_deployment_config()['i-releaser'].workflows, ['B', 'C']);
    save(['', '  ']);
    assert.ok(!('workflows' in DeploymentConfig.get_deployment_config()['i-releaser']), 'no list: all workflows of i-Releaser');
    assert.ok(!(await fse.readFile(toml_file, 'utf8')).includes('auth-token'));
  });


  test('OBI Build view: open i-Releaser without deployment.toml or URL offers the config; with a URL it opens it', async () => {
    const open = sinon.stub(vscode.env, 'openExternal').resolves(true);
    const error = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);

    await fse.remove(path.join(Workspace.get_workspace(), Constants.DEPLOYMENT_CONFIG_FILE));
    await DeploymentConfig.open_web_app();
    assert.ok(open.notCalled);
    assert.match(String(error.firstCall.args[0]), /No i-Releaser URL/);
    assert.strictEqual(error.firstCall.args[1], 'Open deployment config');

    await deployment_toml('[i-releaser]\nurl = "javascript:alert(1)"\n');
    await DeploymentConfig.open_web_app();
    assert.ok(open.notCalled, 'no http(s) URL');

    await deployment_toml('[i-releaser]\nurl = "http://athoed40:8011/ir/"\n');
    await DeploymentConfig.open_web_app();
    assert.strictEqual(open.firstCall.args[0].toString(), 'http://athoed40:8011/ir/');
  });


  test('start: refused in an untrusted workspace', async function () {
    await deployment_toml('[i-releaser]\nurl = "http://127.0.0.1:9"\n');
    try {
      sinon.stub(vscode.workspace, 'isTrusted').value(false);
    }
    catch {
      this.skip();   // the API property can't be stubbed in this VS Code version
    }
    const warning = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    const quick_pick = sinon.stub(vscode.window, 'showQuickPick');
    await BuildSummary.start_deployment();
    assert.match(String(warning.firstCall.args[0]), /Starting an i-Releaser workflow is disabled/);
    assert.ok(quick_pick.notCalled);
  });


  test('the page sends start_deployment without fields', () => {
    const start = sinon.stub(BuildSummary, 'start_deployment').resolves();
    BuildSummary.on_message({ command: 'start_deployment', url: 'http://evil.example' });
    assert.ok(start.calledOnceWithExactly());
  });
});
