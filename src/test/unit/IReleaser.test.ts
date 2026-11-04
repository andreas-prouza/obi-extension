import assert from 'assert';
import * as http from 'http';
import { AddressInfo } from 'net';
import { IReleaserError, base_url, configured_workflows, deployment_data, deployment_of, get_workflows, show_details_url, start_workflow, workflow_choices } from '../../shared/IReleaser';


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
