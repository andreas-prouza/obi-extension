import assert from 'assert';
import * as http from 'http';
import * as path from 'path';
import * as fse from 'fs-extra';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AddressInfo } from 'net';
import { OBITools } from '../../extension/utilities/OBITools';
import { Workspace } from '../../extension/utilities/Workspace';
import { Constants } from '../../shared/Constants';
import { DeploymentConfig } from '../../webview/deployment/DeploymentConfig';
import { DeploymentWatcher } from '../../webview/deployment/DeploymentWatcher';
import { DeploymentsView, LOG_SCHEME } from '../../webview/deployment/DeploymentsView';
import { reset_workspace } from './workspace_fixture';


interface Received { method?: string; url?: string; authorization?: string }

/** Local i-Releaser: project erp with deployments 100 … 76 (100 is running, its stage TEST failed) */
async function i_releaser(workflows: unknown[] = [{ name: 'Deploy OBI Build', default_project: 'erp' }]) {
  const received: Received[] = [];
  const meta_file = (id: string) => ({ general: { id: Number(id), status: 'failed', deploy_version: 42, processed_stages: [
    { id: 1, name: 'START', status: 'finished', actions: [{ id: 10, sequence: 1, cmd: 'SAVOBJ', status: 'finished', processing_step: 'save objects', run_history: [{ id: 5 }] }] },
  ], open_stages: [
    { id: 2, name: 'TEST', status: 'failed', actions: [{ id: 20, sequence: 1, cmd: 'CALL PGM(TEST)', status: 'failed', processing_step: 'run tests', run_history: [{ id: 10 }, { id: 11 }] }] },
    { id: 3, name: 'PROD', status: 'new', actions: [] },
  ] } });

  const srv = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, authorization: req.headers['authorization'] });
      const url = req.url ?? '';
      const json = (data: unknown, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
      let match: RegExpExecArray | null;
      if (url.startsWith('/api/watch_state/')) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: {"page": "first"}\n\n');
      }
      else if (url === '/api/get_workflows')
        json(workflows);
      else if (/^\/api\/list_deployments\/(erp|web)$/.test(url))
        json(Array.from({ length: 25 }, (_, i) => ({ meta_file_id: 100 - i, version: 42 - i, status: i === 0 ? 'failed' : 'finished', workflow_name: 'Deploy OBI Build', commit: null, create_time: 't', update_time: 't' })));
      else if ((match = /^\/api\/get_meta_file_json\/(\d+)$/.exec(url)))
        json(meta_file(match[1]));
      else if (url.startsWith('/api/run_stage/'))
        json({ status: 'success', mode: 'service', job_id: 1, service_running: false });
      else if (url.startsWith('/api/cancel_deployment/'))
        json({ status: 'success' });
      else if (url === '/api/get_action_log/11')
        json({ id: 11, status: 'failed', create_time: '2026-11-12 10:00', stdout: 'OUTPUT OF THE STEP', stderr: 'CPF9898' });
      else
        json({ status: 'error', message: `unknown: ${url}` }, 404);
    });
  });
  await new Promise<void>(resolve => srv.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  return { url, received, close: () => new Promise<void>(resolve => { srv.closeAllConnections(); srv.close(() => resolve()); }) };
}

type Item = { key: string; kind: string };

async function children(view: DeploymentsView, node?: Item): Promise<Item[]> {
  return await view.getChildren(node as never) as unknown as Item[];
}

function item(view: DeploymentsView, node: Item): vscode.TreeItem {
  return view.getTreeItem(node as never);
}

async function deployment_toml(text: string): Promise<void> {
  await fse.outputFile(path.join(Workspace.get_workspace(), Constants.DEPLOYMENT_CONFIG_FILE), text);
}

/** The modal confirmations answer with their button, other warnings with nothing */
function confirm_all(): sinon.SinonStub {
  return sinon.stub(vscode.window, 'showWarningMessage').callsFake((async (...args: unknown[]) => {
    const options = args[1] as { modal?: boolean } | undefined;
    return typeof options === 'object' && options?.modal ? args[2] : undefined;
  }) as never);
}


suite('i-Releaser deployments view', () => {

  let context: vscode.ExtensionContext | undefined;

  setup(async () => {
    await reset_workspace();
    const secrets = new Map<string, string>();
    context = OBITools.ext_context;
    OBITools.ext_context = {
      secrets: {
        get: async (key: string) => secrets.get(key),
        store: async (key: string, value: string) => { secrets.set(key, value); },
        delete: async (key: string) => { secrets.delete(key); }
      }
    } as unknown as vscode.ExtensionContext;
    DeploymentWatcher['tokens'] = { get_auth_token: url => DeploymentConfig.get_auth_token(url), is_token_key: key => DeploymentConfig.is_token_key(key) };
    DeploymentWatcher.retry_ms = [50];
  });

  teardown(() => {
    DeploymentWatcher.stop_all();
    sinon.restore();
    OBITools.ext_context = context;
  });


  test('one project: its deployments with the local build, paging, stages and steps', async () => {
    const ir = await i_releaser();
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\n`);
      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      await fse.outputJson(path.join(Workspace.get_workspace(), Constants.BUILD_HISTORY_DIR, '2026-11-04T10.00.00.000000', 'compile-list.json'),
        { timestamp: '2026-11-04T10:00:00.000000', compiles: [], custom_data: { 'i-releaser': { id: 100, workflow: 'Deploy OBI Build' } } });
      const view = new DeploymentsView();

      let root = await children(view);
      assert.strictEqual(root.length, 21);
      assert.strictEqual(root[20].kind, 'more');
      const first = item(view, root[0]);
      assert.strictEqual(first.label, '42 · Deploy OBI Build');
      assert.match(String(first.description), /^failed · build 2026-11-04 /);
      assert.strictEqual(first.contextValue, 'obi.ir.deployment.open.build');
      assert.strictEqual(item(view, root[1]).contextValue, 'obi.ir.deployment');

      // Show more: 25, no more item
      const fire = sinon.spy(view['changed'], 'fire');
      view['show_more'](root[20]);
      assert.ok(fire.calledOnce);
      root = await children(view);
      assert.strictEqual(root.length, 25);

      const stages = await children(view, root[0]);
      assert.deepStrictEqual(stages.map(stage => [item(view, stage).label, item(view, stage).description, item(view, stage).contextValue]),
        [['START', 'finished', 'obi.ir.stage'], ['TEST', 'failed', 'obi.ir.stage.retry.failedlog'], ['PROD', 'new', 'obi.ir.stage']]);
      const steps = await children(view, stages[1]);
      const step = item(view, steps[0]);
      assert.strictEqual(step.label, 'run tests');
      assert.strictEqual(step.contextValue, 'obi.ir.step.log');
      assert.strictEqual(step.command?.command, 'obi.deployment.show-log');

      assert.ok(ir.received.every(r => r.authorization === 'Bearer TOKEN-1'));
      // Lists are cached until refresh
      assert.strictEqual(ir.received.filter(r => r.url === '/api/list_deployments/erp').length, 1);
      view.refresh();
      await children(view);
      assert.strictEqual(ir.received.filter(r => r.url === '/api/list_deployments/erp').length, 2);
    }
    finally {
      await ir.close();
    }
  });


  test('a deployment newer than the list (started from the build summary) reads the list again, once', async () => {
    const ir = await i_releaser();
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\n`);
      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      const view = new DeploymentsView();
      await children(view);
      const lists = () => ir.received.filter(r => r.url === '/api/list_deployments/erp').length;
      const fire = sinon.spy(view['changed'], 'fire');

      view['watcher_changed'](ir.url, '50');    // older, e.g. on page 3: no reload
      view['watcher_changed']('http://other', '101');
      assert.ok(fire.notCalled);

      view['watcher_changed'](ir.url, '101');
      assert.ok(fire.calledOnceWithExactly(undefined));
      await children(view);
      assert.strictEqual(lists(), 2);

      // The server doesn't have it yet: not again for the same id
      view['watcher_changed'](ir.url, '101');
      assert.ok(fire.calledOnce);
    }
    finally {
      await ir.close();
    }
  });


  test('several projects: one node per project; the project of deployment.toml', async () => {
    const ir = await i_releaser([{ name: 'A', default_project: 'erp' }, { name: 'B', default_project: 'web' }]);
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\n`);
      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      const view = new DeploymentsView();
      const root = await children(view);
      assert.deepStrictEqual(root.map(node => item(view, node).label), ['erp', 'web']);
      assert.strictEqual((await children(view, root[0])).length, 21);

      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\nproject = "erp"\n`);
      view.refresh();
      assert.strictEqual((await children(view)).length, 21);
    }
    finally {
      await ir.close();
    }
  });


  test('without token or URL: an info item, no request; an error of i-Releaser: its message', async () => {
    const ir = await i_releaser([]);
    try {
      const view = new DeploymentsView();
      await deployment_toml('[i-releaser]\nurl = ""\n');
      assert.match(String(item(view, (await children(view))[0]).label), /No i-Releaser URL/);

      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\n`);
      view.refresh();
      const info = item(view, (await children(view))[0]);
      assert.match(String(info.label), /No i-Releaser token is stored for/);
      assert.strictEqual(info.command?.command, 'obi.deployment.maintain');
      assert.strictEqual(ir.received.length, 0);

      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      view.refresh();
      assert.match(String(item(view, (await children(view))[0]).label), /no projects for this token/);

      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\nproject = "unknown"\n`);
      view.refresh();
      assert.match(String(item(view, (await children(view))[0]).label), /HTTP 404: unknown: \/api\/list_deployments\/unknown/);
    }
    finally {
      await ir.close();
    }
  });


  test('context key: whether deployment.toml has a URL', async () => {
    const execute = sinon.stub(vscode.commands, 'executeCommand').resolves(undefined);
    await deployment_toml('[i-releaser]\nurl = "https://ireleaser.example"\n');
    await DeploymentsView.update_context();
    await deployment_toml('[i-releaser]\nurl = "javascript:alert(1)"\n');
    await DeploymentsView.update_context();
    assert.deepStrictEqual(execute.getCalls().map(call => call.args), [['setContext', 'obi.i-releaser-configured', true], ['setContext', 'obi.i-releaser-configured', false]]);
  });


  test('expanding a running deployment watches it, collapsing ends it, at most 5', async () => {
    const ir = await i_releaser();
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\n`);
      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      const view = new DeploymentsView();
      const root = await children(view);
      // Only deployment 100 is running: finished ones aren't watched
      view['expanded'](root[1] as never);
      assert.strictEqual(DeploymentWatcher.info(ir.url, 99), undefined);
      view['expanded'](root[0] as never);
      assert.ok(DeploymentWatcher.info(ir.url, 100));
      view['collapsed'](root[0] as never);
      assert.strictEqual(DeploymentWatcher.info(ir.url, 100), undefined);

      for (const node of root.slice(0, 7))
        (node as unknown as { summary: { status: string } }).summary.status = 'in process';
      for (const node of root.slice(0, 7))
        view['expanded'](node as never);
      const watched = [100, 99, 98, 97, 96, 95, 94].filter(id => DeploymentWatcher.info(ir.url, id) !== undefined);
      assert.deepStrictEqual(watched, [98, 97, 96, 95, 94]);
    }
    finally {
      await ir.close();
    }
  });


  test('run a stage: confirmation, request, the deployment is watched; declined: nothing is sent', async () => {
    const ir = await i_releaser();
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\n`);
      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      const view = new DeploymentsView();
      const stages = await children(view, (await children(view))[0]);
      const warning = confirm_all();

      await view.run_stage(stages[1], 'run_all');
      assert.match(String(warning.firstCall.args[0]), /Run all steps of stage TEST of deployment 100 \(Deploy OBI Build, version 42\) again\?/);
      assert.deepStrictEqual(warning.firstCall.args[1], { modal: true, detail: `i-Releaser: ${ir.url}` });
      assert.ok(ir.received.some(r => r.method === 'POST' && r.url === '/api/run_stage/100/2/run_all'));
      assert.match(String(warning.secondCall.args[0]), /Stage TEST waits in the queue/);
      assert.ok(DeploymentWatcher.info(ir.url, 100), 'watched after the start');

      // Declined
      warning.restore();
      sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined as never);
      const before = ir.received.length;
      await view.run_stage(stages[1], 'continue');
      assert.ok(ir.received.slice(before).every(r => !r.url?.startsWith('/api/run_stage')));
    }
    finally {
      await ir.close();
    }
  });


  test('run a stage: never beyond run-stages, a finished stage or the wrong option', async () => {
    const ir = await i_releaser();
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\nrun-stages = ["START"]\n`);
      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      const view = new DeploymentsView();
      const stages = await children(view, (await children(view))[0]);
      const test_stage = item(view, stages[1]);
      assert.strictEqual(test_stage.contextValue, 'obi.ir.stage.failedlog', 'no run command');
      assert.match(String(test_stage.tooltip), /Not in run-stages/);
      confirm_all();

      await view.run_stage(stages[1], 'continue');
      await view.run_stage(stages[0], 'continue');   // finished
      await view.run_stage({ key: stages[1].key, kind: 'stage' }, 'continue');   // not an item of the tree
      assert.ok(ir.received.every(r => !r.url?.startsWith('/api/run_stage')));
    }
    finally {
      await ir.close();
    }
  });


  test('cancel a deployment with confirmation', async () => {
    const ir = await i_releaser();
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\n`);
      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      const view = new DeploymentsView();
      const root = await children(view);
      const warning = confirm_all();
      const info = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);

      await view.cancel(root[1]);   // finished: nothing
      await view.cancel(root[0]);
      assert.strictEqual(warning.callCount, 1);
      assert.match(String(warning.firstCall.args[0]), /Cancel deployment 100 \(Deploy OBI Build, version 42\)\?/);
      assert.match(String((warning.firstCall.args[1] as { detail: string }).detail), /already running is not stopped/);
      assert.deepStrictEqual(ir.received.filter(r => r.url?.startsWith('/api/cancel_deployment')).map(r => `${r.method} ${r.url}`), ['POST /api/cancel_deployment/100']);
      assert.match(String(info.firstCall.args[0]), /Deployment 100 canceled/);
    }
    finally {
      await ir.close();
    }
  });


  test('log of a step: get_action_log of the run; other documents are refused', async () => {
    const ir = await i_releaser();
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\n`);
      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      const view = new DeploymentsView();
      const stages = await children(view, (await children(view))[0]);
      const opened = sinon.stub(vscode.workspace, 'openTextDocument').resolves({} as vscode.TextDocument);
      sinon.stub(vscode.window, 'showTextDocument').resolves(undefined as never);

      await view.show_failed_log(stages[1]);
      const uri = opened.firstCall.args[0] as unknown as vscode.Uri;
      assert.strictEqual(uri.scheme, LOG_SCHEME);
      assert.strictEqual(uri.path, '/run/11/100 TEST run tests.log');
      assert.ok(!uri.toString().includes('127.0.0.1') && !uri.toString().includes('TOKEN'));

      const token = new vscode.CancellationTokenSource().token;
      const text = await view.provideTextDocumentContent(uri, token);
      assert.match(text, /i-Releaser deployment 100 · stage TEST · run tests/);
      assert.match(text, /Command: CALL PGM\(TEST\)/);
      assert.match(text, /--- stdout ---\nOUTPUT OF THE STEP/);
      assert.match(text, /--- stderr ---\nCPF9898/);

      const before = ir.received.length;
      assert.match(await view.provideTextDocumentContent(vscode.Uri.from({ scheme: LOG_SCHEME, path: '/run/../../etc/x.log' }), token), /Invalid i-Releaser log document/);
      assert.strictEqual(ir.received.length, before);
    }
    finally {
      await ir.close();
    }
  });


  test('untrusted workspace: nothing is read or sent', async function () {
    const ir = await i_releaser();
    try {
      await deployment_toml(`[i-releaser]\nurl = "${ir.url}"\n`);
      await DeploymentConfig.store_auth_token(ir.url, 'TOKEN-1');
      try {
        sinon.stub(vscode.workspace, 'isTrusted').value(false);
      }
      catch {
        this.skip();   // the API property can't be stubbed in this VS Code version
      }
      sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined as never);
      const view = new DeploymentsView();
      assert.match(String(item(view, (await children(view))[0]).label), /trusted workspace/);
      assert.strictEqual(ir.received.length, 0);
    }
    finally {
      await ir.close();
    }
  });
});
