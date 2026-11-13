import assert from 'assert';
import * as http from 'http';
import { AddressInfo } from 'net';
import { DeploymentState, IReleaserError, SseParser, base_url, configured_workflows, deployment_data, deployment_of, get_deployment, get_workflows, is_final, parse_deployment, show_details_url, start_workflow, state_changes, status_class, watch_state, workflow_choices } from '../../shared/IReleaser';


interface Received { method?: string; url?: string; headers: http.IncomingHttpHeaders; body: string }

/** Local i-Releaser: answers with status and body of `answer`, records the requests */
async function server(answer: (request: Received) => { status: number; body: string; headers?: Record<string, string> }): Promise<{ base: string; received: Received[]; close: () => Promise<void> }> {
  const received: Received[] = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const request = { method: req.method, url: req.url, headers: req.headers, body: body };
      received.push(request);
      const reply = answer(request);
      res.writeHead(reply.status, { 'Content-Type': 'application/json', ...reply.headers });
      res.end(reply.body);
    });
  });
  await new Promise<void>(resolve => srv.listen(0, '127.0.0.1', resolve));
  const port = (srv.address() as AddressInfo).port;
  return { base: `http://127.0.0.1:${port}/ir`, received: received, close: () => new Promise(resolve => srv.close(() => resolve())) };
}

const json = (status: number, data: unknown) => ({ status: status, body: JSON.stringify(data) });


suite('i-Releaser client', () => {

  test('base_url: http(s) without trailing slash, nothing else', () => {
    assert.strictEqual(base_url('http://athoed40:8011'), 'http://athoed40:8011');
    assert.strictEqual(base_url(' https://ireleaser.example/ir/ '), 'https://ireleaser.example/ir');
    assert.strictEqual(base_url('HTTP://IReleaser:80//'), 'http://ireleaser');
    for (const url of [undefined, null, 42, '', ' ', 'ireleaser:8011', '/api', 'javascript:alert(1)', 'file:///etc/passwd',
      'ftp://ireleaser', 'http://user:pw@ireleaser', 'http://ireleaser/?x=1', 'http://ireleaser/#x', 'http://a b'])
      assert.strictEqual(base_url(url), undefined, String(url));
    assert.strictEqual(show_details_url('http://ir', 'a/1'), 'http://ir/show_details/a%2F1');
  });


  test('get_workflows: token only in the header, names of the answer', async () => {
    const ir = await server(() => json(200, [{ name: 'Deploy OBI Build', default_project: 'erp' }, { name: 'Test' }, { other: 1 }, 'x']));
    try {
      assert.deepStrictEqual(await get_workflows(ir.base, 'se;cret'), ['Deploy OBI Build', 'Test']);
      const request = ir.received[0];
      assert.strictEqual(request.method, 'GET');
      assert.strictEqual(request.url, '/ir/api/get_workflows');
      assert.strictEqual(request.headers['authorization'], 'Bearer se;cret');
      assert.strictEqual(request.headers['accept'], 'application/json');
    }
    finally {
      await ir.close();
    }
  });


  test('start_workflow: POST of the custom data, deployment of the answer', async () => {
    const ir = await server(() => json(200, { status: 'success', meta_file: { general: { id: 123, project: 'erp', deploy_version: 42, workflow: { name: 'x' } } } }));
    try {
      const record = await start_workflow(ir.base, 'tok', 'Deploy OBI Build/Test', { compiles: [] }, undefined, new Date('2026-11-04T10:00:00Z'));
      assert.deepStrictEqual(record, { id: 123, workflow: 'Deploy OBI Build/Test', project: 'erp', deploy_version: 42, started: '2026-11-04T10:00:00.000Z' });
      const request = ir.received[0];
      assert.strictEqual(request.method, 'POST');
      assert.strictEqual(request.url, '/ir/api/start_workflow/Deploy%20OBI%20Build%2FTest');
      assert.strictEqual(request.headers['authorization'], 'Bearer tok');
      assert.strictEqual(request.headers['content-type'], 'application/json');
      assert.deepStrictEqual(JSON.parse(request.body), { compiles: [] });
    }
    finally {
      await ir.close();
    }
  });


  test('errors: message of i-Releaser, never the token', async () => {
    const answers = [
      { reply: json(401, { status: 'error', message: 'Your authentication-token is not permitted' }), expected: /^HTTP 401: Your authentication-token is not permitted$/ },
      { reply: json(422, { status: 'error', message: { detail: 'too large' } }), expected: /^HTTP 422: \{"detail":"too large"\}$/ },
      // A version that reads the token only from the URL
      { reply: json(401, { status: 'error', message: 'You are not logged in' }), expected: /^HTTP 401: You are not logged in \(i-Releaser ignored the token .*3\.1\.0 or newer is needed\)$/ },
      // Older i-Releaser: redirect to the login page, or the page itself
      { reply: { status: 302, body: '', headers: { Location: '/login' } }, expected: /HTTP 302 without JSON answer\. i-Releaser 3\.1\.0 or newer is needed/ },
      { reply: { status: 200, body: '<html>login</html>' }, expected: /HTTP 200 without JSON answer/ },
      { reply: json(200, { Error: 'Workflow not found' }), expected: /^Workflow not found$/ },
      { reply: json(200, { status: 'error', message: 'Stage not ready' }), expected: /^Stage not ready$/ },
      { reply: json(200, { status: 'success', meta_file: { general: {} } }), expected: /^Answer without deployment id$/ },
    ];
    for (const { reply, expected } of answers) {
      const ir = await server(() => reply);
      try {
        await assert.rejects(start_workflow(ir.base, 'TOKEN-123', 'wf', {}), (e: unknown) => {
          assert.ok(e instanceof IReleaserError, String(e));
          assert.match(e.message, expected);
          assert.ok(!e.message.includes('TOKEN-123'));
          return true;
        });
      }
      finally {
        await ir.close();
      }
    }
  });


  test('errors: server not reachable, cancelled request', async () => {
    const ir = await server(() => json(200, []));
    const base = ir.base;
    await ir.close();
    await assert.rejects(get_workflows(base, 'TOKEN-123'), (e: unknown) => e instanceof IReleaserError && e.message.startsWith(`${base} is not reachable`) && !e.message.includes('TOKEN-123'));

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(get_workflows('http://127.0.0.1:9', 'tok', controller.signal), (e: unknown) => !(e instanceof IReleaserError));
  });


  test('deployment_data: without joblogs, config and earlier deployments; the build list is not changed', () => {
    const compile_list = {
      timestamp: 't',
      config: { global: { variables: { 'secret-token': 'x' } } },
      custom_data: { ticket: 'ABC-1', 'i-releaser': { id: 1 }, json: { meta_file: {} } },
      compiles: [{ level: 1, sources: [{ source: 'a', cmds: [{ cmd: 'c', status: 'success', joblog: 'J', stdout: 'O', stderr: 'E' }] }] }, { level: 2 }],
    };
    const before = JSON.stringify(compile_list);

    assert.deepStrictEqual(deployment_data(compile_list), {
      timestamp: 't',
      custom_data: { ticket: 'ABC-1' },
      compiles: [{ level: 1, sources: [{ source: 'a', cmds: [{ cmd: 'c', status: 'success' }] }] }, { level: 2 }],
    });
    assert.strictEqual(JSON.stringify(compile_list), before);
  });


  test('deployment_of: stored by OBI, or by a custom template', () => {
    assert.deepStrictEqual(deployment_of({ custom_data: { 'i-releaser': { id: 7, workflow: 'wf' }, json: { meta_file: { general: { id: 3 } } } } }), { id: 7, workflow: 'wf' });
    assert.deepStrictEqual(deployment_of({ custom_data: { json: { meta_file: { general: { id: 3 } } } } }), { id: 3 });
    for (const compile_list of [undefined, {}, { custom_data: [] }, { custom_data: { 'i-releaser': { id: {} } } }, { custom_data: { json: 'x' } }])
      assert.strictEqual(deployment_of(compile_list), undefined, JSON.stringify(compile_list));
  });


  test('configured_workflows: trimmed names of a list', () => {
    assert.deepStrictEqual(configured_workflows([' A ', '', 'B', 'A', 7, '  ']), ['A', 'B']);
    for (const value of [undefined, 'A', { A: 1 }, []])
      assert.deepStrictEqual(configured_workflows(value), [], JSON.stringify(value));
  });


  test('workflow_choices: the list of deployment.toml, the default first, only names i-Releaser knows', () => {
    const available = ['Test', 'Prod', 'UAT'];
    // No list: all workflows of i-Releaser
    assert.deepStrictEqual(workflow_choices(available, undefined, undefined), { choices: ['Test', 'Prod', 'UAT'], unknown: [] });
    assert.deepStrictEqual(workflow_choices(available, [], ' UAT '), { choices: ['UAT', 'Test', 'Prod'], unknown: [] });
    // A list: in its order, plus the default
    assert.deepStrictEqual(workflow_choices(available, ['UAT', 'Test'], ''), { choices: ['UAT', 'Test'], unknown: [] });
    assert.deepStrictEqual(workflow_choices(available, ['UAT', 'Test'], 'Prod'), { choices: ['Prod', 'UAT', 'Test'], unknown: [] });
    assert.deepStrictEqual(workflow_choices(available, ['Test', 'UAT'], 'UAT'), { choices: ['UAT', 'Test'], unknown: [] });
    // Names i-Releaser doesn't know (typo, or no permission of the token)
    assert.deepStrictEqual(workflow_choices(available, ['UAT', 'Tset'], 'Prdo'), { choices: ['UAT'], unknown: ['Prdo', 'Tset'] });
    assert.deepStrictEqual(workflow_choices(available, ['Tset'], undefined), { choices: [], unknown: ['Tset'] });
    assert.deepStrictEqual(workflow_choices(available, undefined, 'Prdo'), { choices: ['Test', 'Prod', 'UAT'], unknown: ['Prdo'] });
  });
});



/** get_meta_file_json answer of a deployment with three stages */
function meta_file(status: string, stages: [number, string, string][]): Record<string, unknown> {
  const as_dict = ([id, name, stage_status]: [number, string, string]) => ({ id: id, name: name, status: stage_status, actions: [] });
  return {
    general: {
      id: 123, project: 'erp', deploy_version: 42, status: status, update_time: '2026-11-11 10:00:00',
      workflow: { name: 'Deploy OBI Build', stages: [] },
      processed_stages: stages.filter(stage => stage[2] === 'finished').map(as_dict),
      open_stages: stages.filter(stage => stage[2] !== 'finished').map(as_dict),
    },
    objects: [], run_history: [], custom_data: { compiles: [] }
  };
}

const state = (status: string, stages: [number, string, string][]): DeploymentState => parse_deployment(meta_file(status, stages));


suite('i-Releaser deployment status', () => {

  test('parse_deployment: stages of both lists in the order of their ids', () => {
    assert.deepStrictEqual(state('in process', [[12, 'TEST', 'in process'], [11, 'START', 'finished'], [13, 'PROD', 'new']]), {
      id: 123, status: 'in process', project: 'erp', deploy_version: 42, workflow: 'Deploy OBI Build', update_time: '2026-11-11 10:00:00',
      stages: [{ id: 11, name: 'START', status: 'finished', steps: [] }, { id: 12, name: 'TEST', status: 'in process', steps: [] }, { id: 13, name: 'PROD', status: 'new', steps: [] }]
    });
    // Only what is needed; broken stages are left out
    assert.deepStrictEqual(parse_deployment({ general: { id: '7', status: 'new', open_stages: [{ id: 1, status: 'ready' }, { name: 'x' }, 'y'], processed_stages: 'z' } }),
      { id: '7', status: 'new', stages: [{ id: 1, name: '1', status: 'ready', steps: [] }] });
    for (const data of [undefined, [], {}, { general: { status: 'new' } }, { general: { id: {}, status: 'new' } }, { general: { id: 1 } }, { status: 'error', message: 'x' }])
      assert.throws(() => parse_deployment(data), IReleaserError, JSON.stringify(data));
  });


  test('state_changes, is_final, status_class', () => {
    const before = state('in process', [[1, 'START', 'finished'], [2, 'TEST', 'in process'], [3, 'PROD', 'new']]);
    assert.deepStrictEqual(state_changes(before, before), []);
    assert.deepStrictEqual(state_changes(before, state('ready', [[1, 'START', 'finished'], [2, 'TEST', 'finished'], [3, 'PROD', 'ready']])),
      [{ kind: 'stage-finished', stage: 'TEST' }]);
    assert.deepStrictEqual(state_changes(before, state('failed', [[1, 'START', 'finished'], [2, 'TEST', 'failed'], [3, 'PROD', 'new']])),
      [{ kind: 'stage-failed', stage: 'TEST' }]);
    // A new stage that is already finished, and a canceled deployment
    assert.deepStrictEqual(state_changes(before, state('canceled', [[1, 'START', 'finished'], [2, 'TEST', 'in process'], [3, 'PROD', 'new'], [4, 'QS', 'finished']])),
      [{ kind: 'stage-finished', stage: 'QS' }, { kind: 'canceled' }]);

    assert.strictEqual(is_final(before), false);
    assert.strictEqual(is_final(state('failed', [])), false, 'a failed stage can be run again');
    assert.strictEqual(is_final(state('finished', [])), true);
    assert.strictEqual(is_final(state('canceled', [])), true);

    assert.deepStrictEqual(['finished', 'failed', 'canceled', 'in process', 'in preperation', 'prepare', 'ready', 'new', 'other'].map(status_class),
      ['success', 'failed', 'failed', 'in_process', 'in_process', 'in_process', 'new', 'new', 'new']);
  });


  test('SseParser: data of complete events, split over chunks', () => {
    const parser = new SseParser();
    assert.deepStrictEqual(parser.push('data: {"page": "a"'), []);
    assert.deepStrictEqual(parser.push('}\n\n: keep-alive\n\ndata: x\r'), ['{"page": "a"}']);
    assert.deepStrictEqual(parser.push('\n\r\n'), ['x']);
    assert.deepStrictEqual(parser.push('event: e\ndata: 1\ndata:2\nid: 5\n\n\n\n'), ['1\n2']);
    assert.throws(() => parser.push(`data: ${'x'.repeat(1024 * 1024)}`), IReleaserError);
  });


  test('get_deployment: POST of get_meta_file_json, token in the header', async () => {
    const ir = await server(() => json(200, meta_file('ready', [[1, 'START', 'ready']])));
    try {
      const deployment = await get_deployment(ir.base, 'tok', 'a/1');
      assert.strictEqual(deployment.status, 'ready');
      assert.strictEqual(ir.received[0].method, 'POST');
      assert.strictEqual(ir.received[0].url, '/ir/api/get_meta_file_json/a%2F1');
      assert.strictEqual(ir.received[0].headers['authorization'], 'Bearer tok');
    }
    finally {
      await ir.close();
    }
  });
});



/** Local i-Releaser for watch_state: `write` gets the response to write events to */
async function sse_server(write: (res: http.ServerResponse, req: http.IncomingMessage) => void): Promise<{ base: string; requests: http.IncomingMessage[]; close: () => Promise<void> }> {
  const requests: http.IncomingMessage[] = [];
  const srv = http.createServer((req, res) => {
    requests.push(req);
    write(res, req);
  });
  await new Promise<void>(resolve => srv.listen(0, '127.0.0.1', resolve));
  const port = (srv.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}`, requests: requests,
    close: () => new Promise(resolve => { srv.closeAllConnections(); srv.close(() => resolve()); })
  };
}

const event_stream = (res: http.ServerResponse) => res.writeHead(200, { 'Content-Type': 'text/event-stream' });


suite('i-Releaser watch_state', () => {

  test('on_change for each event, until the server closes the stream', async () => {
    const ir = await sse_server(res => {
      event_stream(res);
      res.write('data: {"page": "a"}\n\n: keep-alive\n\n');
      setTimeout(() => res.end('data: {"page": "b"}\n\n'), 20);
    });
    try {
      let changes = 0;
      await watch_state(ir.base, 'tok', 5, async () => { changes++; return true; });
      assert.strictEqual(changes, 2);
      assert.strictEqual(ir.requests[0].method, 'GET');
      assert.strictEqual(ir.requests[0].url, '/api/watch_state/5');
      assert.strictEqual(ir.requests[0].headers['authorization'], 'Bearer tok');
      assert.strictEqual(ir.requests[0].headers['accept'], 'text/event-stream');
    }
    finally {
      await ir.close();
    }
  });


  test('stops when on_change returns false; abort', async () => {
    const ir = await sse_server(res => {
      event_stream(res);
      res.write('data: {"page": "a"}\n\n');
      const timer = setInterval(() => res.write(': keep-alive\n\n'), 10);
      res.on('close', () => clearInterval(timer));
    });
    try {
      let changes = 0;
      await watch_state(ir.base, 'tok', 5, async () => { changes++; return false; });
      assert.strictEqual(changes, 1);

      const controller = new AbortController();
      const watching = watch_state(ir.base, 'tok', 5, async () => { controller.abort(); return true; }, controller.signal);
      await assert.rejects(watching, (e: unknown) => !(e instanceof IReleaserError));
    }
    finally {
      await ir.close();
    }
  });


  test('errors: error event, no data, HTTP error', async () => {
    const answers: ((res: http.ServerResponse) => void)[] = [
      res => { event_stream(res); res.write('data: {"status": "error", "message": "Meta file for ID 5 not found"}\n\n'); },
      res => { event_stream(res); },
      res => { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'error', message: 'not permitted' })); },
    ];
    const expected = [/^Meta file for ID 5 not found$/, /^No data from .* within 0\.1 seconds$/, /^HTTP 403: not permitted$/];
    for (let i = 0; i < answers.length; i++) {
      const ir = await sse_server(answers[i]);
      try {
        await assert.rejects(watch_state(ir.base, 'TOKEN-123', 5, async () => true, undefined, 100), (e: unknown) => {
          assert.ok(e instanceof IReleaserError, String(e));
          assert.match(e.message, expected[i]);
          assert.ok(!e.message.includes('TOKEN-123'));
          return true;
        });
      }
      finally {
        await ir.close();
      }
    }
  });
});
