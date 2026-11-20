import assert from 'assert';
import * as http from 'http';
import { AddressInfo } from 'net';
import { DeploymentState, IReleaserError, StageState, get_workflow_definitions, parse_deployment } from '../../shared/IReleaser';
import { cancel_deployment, deployment_overview, deployment_projects, failed_step, get_action_log, is_final_status, is_waiting, list_deployments, may_run_stage, run_stage, stage_options, status_kind } from '../../shared/IReleaserDeployments';


interface Received { method?: string; url?: string; headers: http.IncomingHttpHeaders }

/** Local i-Releaser: answers every request with `status` and the JSON of `data` */
async function server(status: number, data: unknown): Promise<{ base: string; received: Received[]; close: () => Promise<void> }> {
  const received: Received[] = [];
  const srv = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, headers: req.headers });
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    });
  });
  await new Promise<void>(resolve => srv.listen(0, '127.0.0.1', resolve));
  return { base: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, received, close: () => new Promise(resolve => srv.close(() => resolve())) };
}

async function with_server<T>(status: number, data: unknown, fn: (base: string, received: Received[]) => Promise<T>): Promise<T> {
  const ir = await server(status, data);
  try {
    return await fn(ir.base, ir.received);
  }
  finally {
    await ir.close();
  }
}

const stage = (name: string, status: string): StageState => ({ id: 1, name, status, steps: [] });


suite('i-Releaser deployments view', () => {

  test('parse_deployment: the steps of a stage, in the order of their sequence, with their latest run', () => {
    const deployment = parse_deployment({ general: { id: 1, status: 'failed', open_stages: [{ id: 5, name: 'TEST', status: 'failed', actions: [
      { id: 21, sequence: 2, cmd: ' CALL PGM(X) ', status: 'failed', processing_step: 'run program', run_history: [{ id: 9 }, { id: 11 }, { id: 10 }] },
      { id: 20, sequence: 1, cmd: `SAVOBJ ${'X'.repeat(80)}`, status: 'finished', processing_step: '', run_history: [] },
      { id: 22, status: 'new' },
      { sequence: 3, status: 'new' }, 'x',
    ] }] } });
    assert.deepStrictEqual(deployment.stages[0].steps, [
      { id: 22, label: '22', cmd: '', status: 'new' },
      { id: 20, sequence: 1, label: `SAVOBJ ${'X'.repeat(52)}…`, cmd: `SAVOBJ ${'X'.repeat(80)}`, status: 'finished' },
      { id: 21, sequence: 2, label: 'run program', cmd: 'CALL PGM(X)', status: 'failed', last_run: 11 },
    ]);
    assert.strictEqual(failed_step(deployment.stages[0])?.id, 21);
    assert.strictEqual(failed_step(stage('START', 'failed')), undefined);
  });


  test('get_workflow_definitions and list_deployments: fields of the answer, broken entries left out', async () => {
    await with_server(200, [{ name: 'A', default_project: 'erp', stages: [] }, { name: 'B', default_project: '' }, { name: '' }, 'x'], async base => {
      assert.deepStrictEqual(await get_workflow_definitions(base, 'tok'), [{ name: 'A', default_project: 'erp' }, { name: 'B' }]);
    });

    const answer = [
      { meta_file_id: 7, version: 42, status: 'in process', workflow_name: 'Deploy', commit: 'abc', create_time: 't1', update_time: 't2' },
      { meta_file_id: '6', status: 'finished', workflow_name: null, commit: '' },
      { version: 1, status: 'new' }, { meta_file_id: 5 }, null,
    ];
    await with_server(200, answer, async (base, received) => {
      assert.deepStrictEqual(await list_deployments(base, 'tok', 'erp/x y'), [
        { id: 7, version: 42, status: 'in process', workflow: 'Deploy', commit: 'abc', create_time: 't1', update_time: 't2' },
        { id: '6', status: 'finished' },
      ]);
      assert.strictEqual(received[0].method, 'GET');
      assert.strictEqual(received[0].url, '/api/list_deployments/erp%2Fx%20y');
      assert.strictEqual(received[0].headers['authorization'], 'Bearer tok');
    });
    await with_server(200, { status: 'success' }, async base => {
      await assert.rejects(list_deployments(base, 'tok', 'erp'), IReleaserError);
    });
  });


  test('deployment_projects: the project of the config, else of the configured workflows, else of all', () => {
    const definitions = [{ name: 'Deploy ERP', default_project: 'erp' }, { name: 'Deploy Web', default_project: 'web' }, { name: 'Deploy ERP Test', default_project: 'erp' }, { name: 'Other' }];
    assert.deepStrictEqual(deployment_projects(definitions, { project: ' shop ', 'default-workflow': 'Deploy Web' }), ['shop']);
    assert.deepStrictEqual(deployment_projects(definitions, { 'default-workflow': 'deploy web' }), ['web'], 'workflow names without case');
    assert.deepStrictEqual(deployment_projects(definitions, { 'default-workflow': 'Deploy ERP', workflows: ['Deploy ERP Test', 'Typo'] }), ['erp']);
    assert.deepStrictEqual(deployment_projects(definitions, { project: '', 'default-workflow': 'Typo' }), ['erp', 'web'], 'no configured workflow known: all');
    assert.deepStrictEqual(deployment_projects(definitions, {}), ['erp', 'web']);
    assert.deepStrictEqual(deployment_projects([], {}), []);
  });


  test('stage_options and may_run_stage: ready → continue; failed → continue or run_all; run-stages; final deployments', () => {
    assert.deepStrictEqual(stage_options('ready', stage('START', 'ready'), undefined), ['continue']);
    assert.deepStrictEqual(stage_options('failed', stage('TEST', 'failed'), []), ['continue', 'run_all']);
    for (const status of ['new', 'in process', 'finished', 'prepare'])
      assert.deepStrictEqual(stage_options('in process', stage('TEST', status), undefined), [], status);
    assert.deepStrictEqual(stage_options('finished', stage('TEST', 'ready'), undefined), []);
    assert.deepStrictEqual(stage_options('canceled', stage('TEST', 'failed'), undefined), []);

    assert.deepStrictEqual(stage_options('ready', stage('PROD', 'ready'), ['START', ' test ']), []);
    assert.deepStrictEqual(stage_options('ready', stage('Test', 'ready'), ['START', ' test ']), ['continue']);
    assert.ok(may_run_stage('PROD', undefined));
    assert.ok(may_run_stage('PROD', 'PROD'), 'no list: all stages');
    assert.ok(!may_run_stage('PROD', ['START']));
    assert.ok(is_final_status('finished') && is_final_status('canceled') && !is_final_status('failed'));
  });


  test('run_stage: POST with stage and option, answer of the processing service', async () => {
    await with_server(200, { status: 'success', mode: 'service', job_id: 4711, service_running: false }, async (base, received) => {
      assert.deepStrictEqual(await run_stage(base, 'tok', 123, 5, 'run_all'), { mode: 'service', job_id: 4711, service_running: false });
      assert.strictEqual(received[0].method, 'POST');
      assert.strictEqual(received[0].url, '/api/run_stage/123/5/run_all');
      assert.strictEqual(received[0].headers['authorization'], 'Bearer tok');
      // Only the two options; nothing is sent otherwise
      await assert.rejects(run_stage(base, 'tok', 123, 5, 'delete' as 'continue'), IReleaserError);
      assert.strictEqual(received.length, 1);
    });
    await with_server(200, { status: 'success', mode: 'thread' }, async base => {
      assert.deepStrictEqual(await run_stage(base, 'tok', '1/2', '3', 'continue'), { mode: 'thread' });
    });
    await with_server(409, { status: 'error', message: 'Stage TEST is not ready' }, async base => {
      await assert.rejects(run_stage(base, 'TOKEN-1', 1, 2, 'continue'), (e: unknown) => e instanceof IReleaserError && /^HTTP 409: Stage TEST is not ready$/.test(e.message));
    });
  });


  test('cancel_deployment: POST, success answer', async () => {
    await with_server(200, { status: 'success' }, async (base, received) => {
      await cancel_deployment(base, 'tok', 123);
      assert.strictEqual(`${received[0].method} ${received[0].url}`, 'POST /api/cancel_deployment/123');
    });
    await with_server(200, { status: 'other' }, async base => {
      await assert.rejects(cancel_deployment(base, 'tok', 123), IReleaserError);
    });
  });


  test('get_action_log: one run of a step; {} means none', async () => {
    await with_server(200, { id: 11, action_id: 21, create_time: '2026-11-12 10:00:00', status: 'failed', stdout: 'out', stderr: null }, async (base, received) => {
      assert.deepStrictEqual(await get_action_log(base, 'tok', 11), { status: 'failed', create_time: '2026-11-12 10:00:00', stdout: 'out', stderr: '' });
      assert.strictEqual(`${received[0].method} ${received[0].url}`, 'GET /api/get_action_log/11');
    });
    await with_server(200, {}, async base => {
      assert.strictEqual(await get_action_log(base, 'tok', 11), undefined);
    });
    await with_server(200, [], async base => {
      await assert.rejects(get_action_log(base, 'tok', 11), IReleaserError);
    });
  });

  test('status_kind: how a status of i-Releaser is shown', () => {
    assert.deepStrictEqual(
      ['finished', 'failed', 'canceled', 'ready', 'in process', 'in preperation', 'prepare', 'new', 'something else'].map(status_kind),
      ['finished', 'failed', 'canceled', 'ready', 'running', 'running', 'running', 'new', 'new']);
  });


  test('deployment_overview: progress, and the stage that waits: failed before ready', () => {
    const step = (id: number, label: string, status: string, last_run?: number) => ({ id, label, cmd: '', status, last_run });
    const state = (status: string, stages: StageState[]): DeploymentState => ({ id: 80, status, stages });
    const failed: StageState = { id: 2, name: 'Create object list', status: 'failed', steps: [step(21, 'read list', 'finished', 5), step(22, 'list objects', 'failed', 6)] };

    const overview = deployment_overview(state('failed', [stage('START', 'finished'), failed, stage('DEPLOY', 'new')]), undefined);
    assert.strictEqual(overview.done, 1);
    assert.strictEqual(overview.total, 3);
    assert.strictEqual(overview.attention?.stage, failed);
    assert.strictEqual(overview.attention?.kind, 'failed');
    assert.strictEqual(overview.attention?.step?.label, 'list objects');
    assert.strictEqual(overview.attention?.has_log, true);
    assert.deepStrictEqual(overview.attention?.options, ['continue', 'run_all']);
    assert.strictEqual(overview.attention?.not_in_run_stages, false);

    // run-stages of deployment.toml: not from VS Code, with the hint
    const limited = deployment_overview(state('failed', [failed]), ['START']);
    assert.deepStrictEqual(limited.attention?.options, []);
    assert.strictEqual(limited.attention?.not_in_run_stages, true);

    // A failed step without a run has no log
    const no_run: StageState = { ...failed, steps: [step(22, 'list objects', 'failed')] };
    assert.strictEqual(deployment_overview(state('failed', [no_run]), undefined).attention?.has_log, false);

    const ready = deployment_overview(state('in process', [stage('START', 'finished'), stage('PROD', 'ready')]), undefined);
    assert.strictEqual(ready.attention?.kind, 'ready');
    assert.deepStrictEqual(ready.attention?.options, ['continue']);

    // Nothing waits: running, or a ready stage of a canceled deployment
    assert.strictEqual(deployment_overview(state('in process', [stage('START', 'in process'), stage('PROD', 'new')]), undefined).attention, undefined);
    assert.strictEqual(deployment_overview(state('canceled', [stage('PROD', 'ready')]), undefined).attention, undefined);
    // A failed stage of a canceled deployment is shown, without actions
    assert.deepStrictEqual(deployment_overview(state('canceled', [failed]), undefined).attention?.options, []);
    assert.strictEqual(deployment_overview(state('canceled', [failed]), undefined).attention?.not_in_run_stages, false);
  });


  test('waiting stages: waiting_for of i-Releaser; not offered to run; the overview takes another stage', () => {
    const deployment = parse_deployment({ general: { id: 1, status: 'ready', processed_stages: [{ id: 1, name: 'A', status: 'finished', waiting_for: [] }], open_stages: [
      { id: 2, name: 'B', status: 'ready', waiting_for: [] },
      { id: 3, name: 'MERGE', status: 'new', waiting_for: ['B', '', 7, 'C'] },
      { id: 4, name: 'OLD', status: 'new', waiting_for: 'B' },
      { id: 5, name: 'NONE', status: 'new' },
    ] } });
    const [a, b, merge, old, none] = deployment.stages;
    assert.deepStrictEqual(merge.waiting_for, ['B', 'C']);
    // Waits for nothing, or an answer it can't read: no field
    for (const item of [a, b, old, none])
      assert.ok(!('waiting_for' in item), item.name);
    assert.ok(is_waiting(merge));
    assert.ok(!is_waiting(b) && !is_waiting(none));

    // i-Releaser before the fix set it ready as soon as one branch was finished: not offered to run
    const early: StageState = { id: 6, name: 'MERGE', status: 'ready', waiting_for: ['B'], steps: [] };
    assert.deepStrictEqual(stage_options('ready', early, undefined), []);

    const both_ready = deployment_overview({ id: 80, status: 'ready', stages: [stage('A', 'finished'), early, { ...stage('B', 'ready'), id: 2 }] }, undefined);
    assert.strictEqual(both_ready.attention?.stage.name, 'B');
    assert.deepStrictEqual(both_ready.attention?.options, ['continue']);

    // B runs: nothing to do in VS Code, MERGE is no "ready to run" stage
    assert.strictEqual(deployment_overview({ id: 80, status: 'in process', stages: [stage('A', 'finished'), early, { ...stage('B', 'in process'), id: 2 }] }, undefined).attention, undefined);
  });
});
