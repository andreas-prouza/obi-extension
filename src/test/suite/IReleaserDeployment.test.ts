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
import { DeploymentWatcher } from '../../webview/deployment/DeploymentWatcher';
import { DirTool } from '../../extension/utilities/DirTool';
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


/** A stage of the local i-Releaser: id, name, status, and optionally its steps (actions) and the stages it waits for */
type TestStage = [number, string, string, unknown[]?, string[]?];

/** Local i-Releaser with deployment 123: `stages` is its state, `push()` sends an event to the open watch_state streams */
async function i_releaser_status(stages: TestStage[]) {
  const received: Received[] = [];
  const streams = new Set<http.ServerResponse>();
  const ir = {
    url: '', received: received, stages: stages, status: 'in process',
    push: () => streams.forEach(res => res.write('data: {"page": "changed"}\n\n')),
    close: () => new Promise<void>(resolve => { srv.closeAllConnections(); srv.close(() => resolve()); })
  };
  const srv = http.createServer((req, res) => {
    received.push({ method: req.method, url: req.url, authorization: req.headers['authorization'], body: '' });
    if (req.url === '/api/watch_state/123') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"page": "first"}\n\n');
      streams.add(res);
      res.on('close', () => streams.delete(res));
      return;
    }
    const as_dict = ([id, name, status, actions, waiting_for]: TestStage) => ({ id: id, name: name, status: status, ...(actions ? { actions: actions } : {}), ...(waiting_for ? { waiting_for: waiting_for } : {}) });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ general: {
      id: 123, status: ir.status, deploy_version: 7, workflow: { name: 'wf' },
      processed_stages: ir.stages.filter(s => s[2] === 'finished').map(as_dict), open_stages: ir.stages.filter(s => s[2] !== 'finished').map(as_dict)
    } }));
  });
  await new Promise<void>(resolve => srv.listen(0, '127.0.0.1', resolve));
  ir.url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  return ir;
}

/** The stages of the card: class, icon (or number), name and status of each */
function stages_of(html: string): string[] {
  return [...html.matchAll(/<li class="([^"]+)" data-stage-id="\d+">\s*<span class="ir-dot">(?:<span class="codicon codicon-([^"]+)"><\/span>|(\d+))<\/span>\s*<span class="ir-name">([^<]*)<\/span>\s*<span class="ir-state">([^<]*)<\/span>/g)]
    .map(m => [m[1], m[2] ?? m[3], m[4], m[5]].join('|'));
}

/** The buttons of the bar below the stages: action and stage of each */
function actions_of(html: string): string[] {
  return [...html.matchAll(/class="ir-action btn[^"]*" data-action="(\w+)" data-stage-id="(\d+)"/g)].map(m => `${m[1]} ${m[2]}`);
}

async function until(condition: () => boolean, what: string): Promise<void> {
  for (let waited = 0; !condition(); waited += 20) {
    if (waited > 5000)
      assert.fail(`timeout: ${what}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
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
    // The tests use their own copy of the modules: the extension registered the token store in its bundle
    DeploymentWatcher['tokens'] = { get_auth_token: url => DeploymentConfig.get_auth_token(url), is_token_key: key => DeploymentConfig.is_token_key(key) };
    DeploymentWatcher.retry_ms = [50];
    BuildSummary['_current_compile_output_folder'] = undefined;
  });

  teardown(() => {
    DeploymentWatcher.stop_all();
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


  test('start: the build list without joblogs goes to i-Releaser, the deployment into the build list and its history copy', async () => {
    const ir = await i_releaser();
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\ndefault-workflow = "Deploy OBI Build"\n`);
      assert.ok(await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1'));
      // The current build (live list) and its copy in the build history; another build is not changed
      const ws = Workspace.get_workspace();
      const live_file = path.join(ws, AppConfig.get_app_config().general['compile-list']);
      const history_file = path.join(ws, Constants.BUILD_HISTORY_DIR, '2026-11-04T10.00.00.000000', 'compile-list.json');
      const other_file = path.join(ws, Constants.BUILD_HISTORY_DIR, '2026-11-03T10.00.00.000000', 'compile-list.json');
      const git = { branch: 'release', commit: 'abc' };
      await fse.outputJson(live_file, { ...completed_list({ ticket: 'ABC-1' }), git: git });
      await fse.outputJson(history_file, { ...completed_list({ ticket: 'ABC-1' }), git: git });
      await fse.outputJson(other_file, { ...completed_list(), timestamp: '2026-11-03T10:00:00.000000' });
      sinon.stub(BuildSummary, 'update').resolves();
      const watch = sinon.stub(DeploymentWatcher, 'watch');
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

      for (const file of [live_file, history_file]) {
        const written = await fse.readJson(file) as { custom_data: Record<string, Record<string, unknown>>; compiles: { sources: { cmds: Record<string, unknown>[] }[] }[]; git: unknown };
        assert.deepStrictEqual({ ...written.custom_data['i-releaser'], started: undefined }, { id: 123, workflow: 'Deploy OBI Build', project: 'erp', deploy_version: 7, started: undefined }, file);
        assert.strictEqual(written.custom_data['ticket'], 'ABC-1');
        assert.strictEqual(written.compiles[0].sources[0].cmds[0]['joblog'], 'LOG', 'the build list keeps its joblogs');
        assert.deepStrictEqual(written.git, git, 'the git info of the build is kept');
      }
      assert.ok(!('custom_data' in await fse.readJson(other_file)));
      assert.ok(watch.calledOnceWithExactly(ir.url, 123, 'started'));
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
      const write = sinon.stub(DirTool, 'write_json');
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
    assert.match(html, /id="i-releaser\|workflows"[^>]*>A\nB<\/textarea>/);

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


  test('status: the summary shows the stages and follows the changes; a failed stage is reported', async () => {
    const ir = await i_releaser_status([[11, 'START', 'finished'], [12, 'TEST', 'in process'], [13, 'PROD', 'new']]);
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\n`);
      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      sinon.stub(BuildSummary, 'get_compile_list').callsFake(() => completed_list({ 'i-releaser': { id: 123, workflow: 'wf' } }));
      const error = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
      const info = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);

      DeploymentWatcher.show({ base: ir.url, id: 123 });
      assert.match(render(), /id="i_releaser_status"[\s\S]*Loading the deployment status/);
      await until(() => ir.received.some(r => r.url === '/api/watch_state/123'), 'watch_state');
      await until(() => DeploymentWatcher.info(ir.url, 123)?.state?.stages[1].status === 'in process', 'first read');

      const html = render();
      assert.match(html, /version 7<\/span>\s*<span class="status-pill ir-running"><span class="codicon codicon-sync codicon-modifier-spin"><\/span>in process<\/span>/);
      // The stages as a stepper: icon or number, name, status; the line after a finished stage is green
      assert.deepStrictEqual(stages_of(html), [
        'ir-stage ir-finished|check|START|finished', 'ir-stage ir-running ir-after-finished|sync codicon-modifier-spin|TEST|in process', 'ir-stage ir-new|3|PROD|new']);
      assert.match(html, /class="ir-progress" title="1 \/ 3"><div class="ir-progress-bar" style="width: 33%">/);
      assert.ok(!html.includes('i_releaser_attention'), 'nothing waits while a stage runs');
      // Only messages of this deployment count: other parts of the extension may report in the meantime
      const reported = () => [...error.getCalls(), ...info.getCalls()].map(call => String(call.args[0])).filter(text => text.includes('i-Releaser deployment 123'));
      assert.deepStrictEqual(reported(), [], 'nothing is reported on the first read');

      ir.stages = [[11, 'START', 'finished'], [12, 'TEST', 'failed'], [13, 'PROD', 'new']];
      ir.status = 'failed';
      ir.push();
      await until(() => reported().length > 0, 'failed stage reported');
      assert.deepStrictEqual(reported(), ['i-Releaser deployment 123: stage TEST failed.']);
      assert.ok(error.getCalls().some(call => call.args[0] === 'i-Releaser deployment 123: stage TEST failed.'), 'as an error');
      assert.deepStrictEqual(stages_of(render())[1], 'ir-stage ir-failed ir-after-finished|close|TEST|failed');

      assert.ok(ir.received.every(r => r.authorization === 'Bearer TOKEN-1' && !r.url?.includes('TOKEN')));
      assert.deepStrictEqual([...new Set(ir.received.map(r => `${r.method} ${r.url}`))].sort(), ['GET /api/watch_state/123', 'POST /api/get_meta_file_json/123']);

      // Another build list: no longer watched
      DeploymentWatcher.show(undefined);
      assert.strictEqual(DeploymentWatcher.info(ir.url, 123), undefined);
      assert.ok(!render().includes('i_releaser_status'));
    }
    finally {
      await ir.close();
    }
  });


  test('status changes only replace the deployment card, not the whole page (improvements v2.2.3 D2)', async () => {
    const ir = await i_releaser_status([[11, 'START', 'finished'], [12, 'TEST', 'in process'], [13, 'PROD', 'new']]);
    const original_panel = BuildSummary.currentPanel;
    const pages: string[] = [];
    const posted: { command?: string; html?: string }[] = [];
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\n`);
      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      sinon.stub(BuildSummary, 'get_compile_list').callsFake(() => completed_list({ 'i-releaser': { id: 123, workflow: 'wf' } }));
      sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
      sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
      const webview = {
        ...fake_webview,
        set html(value: string) { pages.push(value); },
        postMessage: async (message: { command?: string; html?: string }) => { posted.push(message); return true; }
      };
      BuildSummary.currentPanel = { _panel: { webview } } as unknown as BuildSummary;
      BuildSummary['_extensionUri'] = vscode.Uri.file(Constants.EXTENSION_ROOT);

      await BuildSummary.update();   // the whole page, with the card: watching starts
      assert.strictEqual(pages.length, 1);
      assert.match(pages[0], /id="i_releaser_status"/);
      await until(() => DeploymentWatcher.info(ir.url, 123)?.state?.stages[1].status === 'in process', 'first read');

      ir.stages = [[11, 'START', 'finished'], [12, 'TEST', 'failed'], [13, 'PROD', 'new']];
      ir.status = 'failed';
      ir.push();
      await until(() => DeploymentWatcher.info(ir.url, 123)?.state?.stages[1].status === 'failed', 'failed stage read');
      // What the listener of the panel (constructor) calls for the shown deployment
      await BuildSummary.update_deployment();
      assert.ok(posted.some(message => message.command === 'deployment_card' && message.html?.includes('ir-stage ir-failed')), 'card with the failed stage');
      const card = posted.filter(message => message.command === 'deployment_card').at(-1)?.html ?? '';
      assert.ok(card.trim().startsWith('<div id="i_releaser_status" class="ir-card">') && card.trim().endsWith('</div>'), 'only the card');
      assert.deepStrictEqual(stages_of(card)[1], 'ir-stage ir-failed ir-after-finished|close|TEST|failed');
      assert.ok(!card.includes('build-list'), 'not the build list');
      assert.strictEqual(pages.length, 1, 'no new page');

      // The card disappears (e.g. not watched any more): the whole page
      BuildSummary['_card_shown'] = false;
      await BuildSummary.update_deployment();
      assert.strictEqual(pages.length, 2);
    }
    finally {
      BuildSummary.currentPanel = original_panel;
      await ir.close();
    }
  });


  test('branch build: a deployment that has just finished offers to delete the branch libraries (spec 4.6, step 8)', async () => {
    const ir = await i_releaser_status([[11, 'START', 'finished'], [12, 'PROD', 'in process']]);
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\n`);
      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      await fse.appendFile(path.join(Workspace.get_workspace(), Constants.OBI_APP_CONFIG_FILE), `\n[branch-build]\nticket-pattern = '(\\d+)'\nlib-name = "#X_$(TICKET)"\n`);
      AppConfig.reset();
      const info = sinon.stub(vscode.window, 'showInformationMessage').callsFake(async (message: string) => (/has finished/.test(message) ? 'Branch libraries' : undefined) as unknown as vscode.MessageItem);
      const command = sinon.stub(vscode.commands, 'executeCommand').resolves(undefined);

      DeploymentWatcher.show({ base: ir.url, id: 123 });
      await until(() => DeploymentWatcher.info(ir.url, 123)?.state?.stages[1].status === 'in process', 'first read');
      assert.ok(!info.getCalls().some(call => /has finished/.test(String(call.args[0]))), 'not while it runs');

      ir.stages = [[11, 'START', 'finished'], [12, 'PROD', 'finished']];
      ir.status = 'finished';
      ir.push();
      await until(() => command.calledWith('obi.branch-libraries'), 'Branch libraries opened');
      assert.ok(info.getCalls().some(call => String(call.args[0]) === 'i-Releaser deployment 123 has finished. Delete the branch libraries of merged tickets?'));
    }
    finally {
      await ir.close();
    }
  });


  test('status: a failed stage shows its step and the buttons; run-stages and a ready stage', async () => {
    const steps = [{ id: 31, sequence: 1, cmd: 'CALL PGM(LIST)', status: 'failed', processing_step: 'list objects', run_history: [{ id: 99 }] }];
    const ir = await i_releaser_status([[11, 'START', 'finished'], [12, 'Create object list', 'failed', steps], [13, 'DEPLOY', 'new']]);
    ir.status = 'failed';
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\n`);
      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      sinon.stub(BuildSummary, 'get_compile_list').callsFake(() => completed_list({ 'i-releaser': { id: 123, workflow: 'wf' } }));
      DeploymentWatcher.show({ base: ir.url, id: 123 });
      await until(() => DeploymentWatcher.info(ir.url, 123)?.state !== undefined, 'first read');

      let html = render();
      assert.match(html, /id="i_releaser_attention" class="ir-attention ir-failed">[\s\S]*Stage Create object list failed in step list objects\./);
      assert.deepStrictEqual(actions_of(html), ['show_log 12', 'continue 12', 'run_all 12']);

      // Not in run-stages: only the log, and the hint
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\nrun-stages = ["START"]\n`);
      html = render();
      assert.deepStrictEqual(actions_of(html), ['show_log 12']);
      assert.match(html, /Not in run-stages of \.obi\/etc\/deployment\.toml: run it in i-Releaser\./);

      // The next stage is ready: it can be run
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\n`);
      ir.stages = [[11, 'START', 'finished'], [12, 'Create object list', 'finished'], [13, 'DEPLOY', 'ready']];
      ir.status = 'in process';
      ir.push();
      await until(() => DeploymentWatcher.info(ir.url, 123)?.state?.stages[2].status === 'ready', 'ready stage');
      html = render();
      assert.match(html, /class="ir-attention ir-ready">[\s\S]*Stage DEPLOY is ready to run\./);
      assert.deepStrictEqual(actions_of(html), ['continue 13']);
    }
    finally {
      await ir.close();
    }
  });


  test('status: a stage which waits for parallel stages says for which, and is not offered to run', async () => {
    const ir = await i_releaser_status([[11, 'START', 'finished'], [12, 'A', 'finished'], [13, 'B', 'ready'], [14, 'MERGE', 'new', undefined, ['B']]]);
    ir.status = 'ready';
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\n`);
      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      sinon.stub(BuildSummary, 'get_compile_list').callsFake(() => completed_list({ 'i-releaser': { id: 123, workflow: 'wf' } }));
      DeploymentWatcher.show({ base: ir.url, id: 123 });
      await until(() => DeploymentWatcher.info(ir.url, 123)?.state !== undefined, 'first read');

      let html = render();
      assert.deepStrictEqual(stages_of(html)[3], 'ir-stage ir-new|4|MERGE|waits for B');
      assert.match(html, /class="ir-attention ir-ready">[\s\S]*Stage B is ready to run\./);
      assert.deepStrictEqual(actions_of(html), ['continue 13']);

      // i-Releaser before the fix: MERGE ready as soon as A was finished. While B runs, nothing is offered
      ir.stages = [[11, 'START', 'finished'], [12, 'A', 'finished'], [13, 'B', 'in process'], [14, 'MERGE', 'ready', undefined, ['B']]];
      ir.status = 'in process';
      ir.push();
      await until(() => DeploymentWatcher.info(ir.url, 123)?.state?.stages[3].status === 'ready', 'ready too early');
      html = render();
      assert.match(stages_of(html)[3], /\|MERGE\|waits for B$/);
      assert.ok(!html.includes('i_releaser_attention'), 'MERGE is not ready to run');
      assert.deepStrictEqual(actions_of(html), []);
    }
    finally {
      await ir.close();
    }
  });


  test('the page names a stage of the shown deployment; the extension decides the rest', async () => {
    const ir = await i_releaser_status([[11, 'START', 'finished'], [12, 'TEST', 'failed']]);
    ir.status = 'failed';
    const actions = { show_summary_log: sinon.stub().resolves(), run_summary_stage: sinon.stub().resolves() };
    BuildSummary.set_stage_actions(actions);
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\n`);
      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      sinon.stub(BuildSummary, 'get_compile_list').callsFake(() => completed_list({ 'i-releaser': { id: 123, workflow: 'wf' } }));
      BuildSummary['follow_deployment'](completed_list({ 'i-releaser': { id: 123, workflow: 'wf' } }));
      await until(() => DeploymentWatcher.info(ir.url, 123)?.state !== undefined, 'first read');

      await BuildSummary.deployment_action('run_all', '12');
      assert.ok(actions.run_summary_stage.calledOnce);
      const [deployment, stage, option] = actions.run_summary_stage.firstCall.args;
      assert.deepStrictEqual([deployment.id, deployment.status, stage.name, option], [123, 'failed', 'TEST', 'run_all']);

      await BuildSummary.deployment_action('show_log', '12');
      assert.deepStrictEqual(actions.show_summary_log.firstCall.args.map((arg: { name?: string }) => arg?.name ?? arg), [123, 'TEST']);

      // A stage the deployment doesn't have, and messages with invalid fields, do nothing
      await BuildSummary.deployment_action('continue', '99');
      BuildSummary.on_message({ command: 'deployment_action', action: 'cancel', stage_id: '12' });
      BuildSummary.on_message({ command: 'deployment_action', action: 'continue', stage_id: '../12' });
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.strictEqual(actions.run_summary_stage.callCount, 1);
    }
    finally {
      BuildSummary.set_stage_actions(undefined);
      await ir.close();
    }
  });


  test('status: without a token nothing is sent, the summary says why; a stored token is used', async () => {
    const ir = await i_releaser_status([[11, 'START', 'ready']]);
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\n`);
      sinon.stub(BuildSummary, 'get_compile_list').callsFake(() => completed_list({ 'i-releaser': { id: 123, workflow: 'wf' } }));

      DeploymentWatcher.show({ base: ir.url, id: 123 });
      await until(() => DeploymentWatcher.info(ir.url, 123)?.error !== undefined, 'hint');
      assert.match(render(), /class="i-releaser-error">.*No i-Releaser token is stored for/);
      assert.strictEqual(ir.received.length, 0);

      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      DeploymentWatcher.token_stored();
      await until(() => DeploymentWatcher.info(ir.url, 123)?.state !== undefined, 'read with the new token');
      assert.ok(!render().includes('i-releaser-error'));
    }
    finally {
      await ir.close();
    }
  });


  test('status: a finished deployment is read once, without watch_state', async () => {
    const ir = await i_releaser_status([[11, 'START', 'finished']]);
    ir.status = 'finished';
    try {
      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      DeploymentWatcher.watch(ir.url, 123, 'started');
      await until(() => DeploymentWatcher.info(ir.url, 123) === undefined && ir.received.length > 0, 'end of the watch');
      assert.deepStrictEqual(ir.received.map(r => r.url), ['/api/get_meta_file_json/123']);
    }
    finally {
      await ir.close();
    }
  });


  test('the page sends start_deployment without fields', () => {
    const start = sinon.stub(BuildSummary, 'start_deployment').resolves();
    BuildSummary.on_message({ command: 'start_deployment', url: 'http://evil.example' });
    assert.ok(start.calledOnceWithExactly());
  });
});
