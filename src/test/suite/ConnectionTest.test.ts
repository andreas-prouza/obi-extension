import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { SSH_Tasks } from '../../extension/utilities/SSH_Tasks';
import { CheckResult, overall_state, test_connection } from '../../extension/utilities/ConnectionTest';
import { OBIConfiguration } from '../../webview/controller/OBIConfiguration';
import { Constants } from '../../shared/Constants';
import { UserCancelledError } from '../../shared/Errors';
import { CONFIGURATION_REQUESTS } from '../../shared/messages/ConfigurationMessages';
import { parse_message } from '../../shared/messages/MessageGuard';


const OK = 'home=/home/MAX\nhome_exists=1\nbashrc=1\npath=/QOpenSys/pkgs/bin:/usr/bin\nbase_dir_exists=1\npython_exists=1\npython_version=Python 3.12.3\nbackend_file_exists=1\nbackend_version=5\n';

const states = (results: CheckResult[]) => results.map(result => result.state);


/** Test connection (improvements v2.2.3 F1) */
suite('Test connection', () => {

  let run: sinon.SinonStub;

  setup(() => {
    sinon.stub(SSH_Tasks, 'connect').resolves();
    sinon.stub(SSH_Tasks, 'connection_label').returns('MAX@ibmi:22');
    sinon.stub(SSH_Tasks, 'get_remote_base_dir').resolves('/home/MAX/proj');
    sinon.stub(SSH_Tasks, 'get_remote_obi_dir').resolves('/home/MAX/obi');
    run = sinon.stub(SSH_Tasks, 'run_command').resolves({ code: 0, stdout: OK, stderr: '' });
  });

  teardown(() => sinon.restore());


  test('everything in place: connection, home, project folder, Python, backend version', async () => {
    const results = await test_connection();
    assert.deepStrictEqual(states(results), ['ok', 'ok', 'ok', 'ok', 'ok']);
    assert.match(results[0].text, /MAX@ibmi:22/);
    assert.match(results[3].text, /3\.12\.3/);
    assert.match(results[4].text, /version 5 in \/home\/MAX\/obi/);
    assert.strictEqual(overall_state(results), 'ok');
    // The script gets the resolved folders, quoted
    assert.match(String(run.firstCall.args[0]), /'\/home\/MAX\/obi\/venv\/bin\/python'/);
  });


  test('notes: no .bashrc, project folder not transferred yet', async () => {
    run.resolves({ code: 0, stdout: OK.replace('bashrc=1\n', '').replace('base_dir_exists=1\n', ''), stderr: '' });
    const results = await test_connection();
    assert.deepStrictEqual(states(results), ['ok', 'warning', 'warning', 'ok', 'ok']);
    assert.match(results[1].text, /\/home\/MAX\/\.bashrc/);
    assert.strictEqual(overall_state(results), 'warning');
  });


  test('problems: no backend in remote-obi-dir; an old backend; an old Python', async () => {
    run.resolves({ code: 0, stdout: 'home=/home/MAX\nhome_exists=1\nbashrc=1\npath=/QOpenSys/pkgs/bin\nbase_dir_exists=1\n', stderr: '' });
    let results = await test_connection();
    assert.deepStrictEqual(states(results), ['ok', 'ok', 'ok', 'error'], 'no version check without the backend');
    assert.match(results[3].text, /\/home\/MAX\/obi\/venv\/bin\/python is missing/);

    run.resolves({ code: 0, stdout: OK.replace('backend_version=5', `backend_version=${Constants.OBI_BACKEND_VERSION - 1}`), stderr: '' });
    results = await test_connection();
    assert.strictEqual(results[4].state, 'error');
    assert.match(results[4].text, /git pull in \/home\/MAX\/obi/);

    run.resolves({ code: 0, stdout: OK.replace('Python 3.12.3', 'Python 3.9.2'), stderr: '' });
    results = await test_connection();
    assert.strictEqual(results[3].state, 'error');
    assert.strictEqual(overall_state(results), 'error');
  });


  test('an incomplete configuration: the connection result and the missing setting', async () => {
    (SSH_Tasks.get_remote_obi_dir as sinon.SinonStub).rejects(new Error("Config attribute 'general.remote-obi-dir' is missing"));
    const results = await test_connection();
    assert.deepStrictEqual(states(results), ['ok', 'error']);
    assert.match(results[1].text, /remote-obi-dir/);
    assert.ok(run.notCalled);
  });


  test('a failed login is one result; a cancelled prompt is passed on', async () => {
    (SSH_Tasks.connect as sinon.SinonStub).rejects(new Error('All configured authentication methods failed'));
    const results = await test_connection();
    assert.deepStrictEqual(states(results), ['error']);
    assert.match(results[0].text, /authentication methods failed/);
    assert.ok(run.notCalled);

    (SSH_Tasks.connect as sinon.SinonStub).rejects(new UserCancelledError('no password'));
    await assert.rejects(() => test_connection(), UserCancelledError);
  });


  test('the configuration page has the button on both tabs; the message is accepted', async () => {
    const context = { secrets: { get: async () => undefined }, workspaceState: { get: () => undefined } } as unknown as vscode.ExtensionContext;
    const webview = { asWebviewUri: (uri: vscode.Uri) => uri, cspSource: 'vscode-resource:' } as unknown as vscode.Webview;
    const html: string = await OBIConfiguration['generate_html'](context, vscode.Uri.file(Constants.EXTENSION_ROOT), webview);
    assert.match(html, /class="btn secondary test_connection" data-target="user"/);
    assert.match(html, /class="btn secondary test_connection" data-target="project"/);
    assert.match(html, /id="user_connection_test"/);
    assert.ok(parse_message('Configuration', { command: 'test_connection' }, CONFIGURATION_REQUESTS, () => undefined));
    assert.strictEqual(parse_message('Configuration', { command: 'test_connection', panel: 5 }, CONFIGURATION_REQUESTS, () => undefined), undefined, 'the UI state is checked');
  });
});
