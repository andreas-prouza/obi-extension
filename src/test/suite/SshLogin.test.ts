import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Config, NodeSSH } from 'node-ssh';
import { SSH_Tasks } from '../../extension/utilities/SSH_Tasks';
import { fingerprint } from '../../extension/utilities/HostKey';
import { Workspace } from '../../extension/utilities/Workspace';
import { AppConfig } from '../../extension/config/AppConfig';
import { Constants } from '../../shared/Constants';
import { reset_workspace } from './workspace_fixture';


const HOST = 'obi-login-test.invalid';
const KEY = Buffer.from('AAAAC3NzaC1lZDI1NTE5AAAAIOp9qDOrXmsElM8aprk7Otak2OLciTi7vda2Hhg8Nr4r', 'base64');
const flush = () => new Promise(resolve => setTimeout(resolve, 10));


function memento(): vscode.Memento {
  const data = new Map<string, unknown>();
  return {
    keys: () => [...data.keys()],
    get: (key: string, default_value?: unknown) => data.has(key) ? data.get(key) : default_value,
    update: async (key: string, value: unknown) => { data.set(key, value); }
  } as unknown as vscode.Memento;
}


suite('SSH login options', () => {

  const original_context = SSH_Tasks.context;
  let secrets: Map<string, string>;
  let workspace_state: vscode.Memento;
  let connect: sinon.SinonStub;
  let input: sinon.SinonStub;
  let info: sinon.SinonStub;
  let error: sinon.SinonStub;
  let configs: Config[];
  /** Errors thrown by the next connects, in order (like ssh2 before or after the handshake) */
  let failures: Error[];

  /** User config of the default profile */
  function user_config(connection: string): void {
    fs.writeFileSync(path.join(Workspace.get_workspace(), Constants.OBI_APP_CONFIG_USER_FILE), `[connection]\nremote-host = "${HOST}"\nssh-user = "MAX"\n${connection}\n`);
    AppConfig.reset();
  }

  setup(async () => {
    await reset_workspace();
    secrets = new Map();
    workspace_state = memento();
    const global_state = memento();
    SSH_Tasks.context = {
      globalState: global_state,
      workspaceState: workspace_state,
      secrets: {
        get: async (key: string) => secrets.get(key),
        store: async (key: string, value: string) => { secrets.set(key, value); },
        delete: async (key: string) => { secrets.delete(key); }
      }
    } as unknown as vscode.ExtensionContext;
    // Known host on both ports
    for (const port of [22, 2222])
      await global_state.update(`obi|hostkey|${HOST}:${port}`, { algorithm: 'ssh-ed25519', fingerprint: fingerprint(KEY), first_seen: '' });

    configs = [];
    failures = [];
    sinon.stub(NodeSSH.prototype, 'isConnected').returns(false);
    input = sinon.stub(vscode.window, 'showInputBox');
    info = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    error = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    connect = sinon.stub(NodeSSH.prototype, 'connect').callsFake(async function (this: NodeSSH, config: Config) {
      configs.push(config);
      const failure = failures.shift();
      if (failure)
        throw failure;
      if (!(config.hostVerifier as (key: Buffer) => boolean)(KEY))
        throw new Error('host key');
      return this;
    });
  });

  teardown(() => {
    sinon.restore();
    SSH_Tasks.context = original_context;
  });


  test('connect options: port, agent, passphrase and the order agent, key, password', () => {
    const config = SSH_Tasks.build_connect_config(
      { host: 'h', port: 2222, username: 'u', password: 'pw', private_key_path: '/k', passphrase: 'pp', agent: '/run/agent' }, () => true);
    assert.strictEqual(config.port, 2222);
    assert.strictEqual(config.agent, '/run/agent');
    assert.strictEqual(config.privateKeyPath, '/k');
    assert.strictEqual(config.passphrase, 'pp');
    assert.deepStrictEqual(config.authHandler, ['none', 'agent', 'publickey', 'password']);
  });


  test('key with ~ and a port: no password prompt; an encrypted key asks for the passphrase and offers to save it', async () => {
    user_config('ssh-key = "~/.ssh/obi_test_key"\nssh-port = 2222');
    failures.push(new Error('Cannot parse privateKey: Encrypted private OpenSSH key detected, but no passphrase given'));
    input.resolves('secret');
    info.withArgs(sinon.match(/passphrase/)).resolves('Save' as unknown as vscode.MessageItem);

    await SSH_Tasks.connect();
    await flush();

    assert.strictEqual(connect.callCount, 2);
    assert.strictEqual(configs[1].privateKeyPath, path.join(os.homedir(), '.ssh', 'obi_test_key'));
    assert.strictEqual(configs[1].port, 2222);
    assert.strictEqual(configs[1].password, undefined);
    assert.strictEqual(configs[1].passphrase, 'secret');
    assert.strictEqual(input.callCount, 1, 'only the passphrase');
    assert.strictEqual(input.firstCall.args[0]?.password, true);
    assert.strictEqual(secrets.get(`obi|default|${HOST}|MAX|passphrase`), 'secret');
  });


  test('a wrong stored passphrase is removed and asked for again', async () => {
    user_config('ssh-key = "/keys/k"');
    secrets.set(`obi|default|${HOST}|MAX|passphrase`, 'old');
    failures.push(new Error('Cannot parse privateKey: Malformed OpenSSH private key. Bad passphrase?'));
    input.resolves('new');

    await SSH_Tasks.connect();
    assert.strictEqual(configs[0].passphrase, 'old');
    assert.strictEqual(configs[1].passphrase, 'new');
    assert.ok(!secrets.has(`obi|default|${HOST}|MAX|passphrase`));
  });


  test('a prompted password can be saved; "Never for this profile" stops asking', async () => {
    user_config('');
    input.resolves('pw');
    info.withArgs(sinon.match(/password/)).resolves('Never for this profile' as unknown as vscode.MessageItem);

    await SSH_Tasks.connect();
    await flush();
    assert.strictEqual(configs[0].password, 'pw');
    assert.strictEqual(workspace_state.get('obi.ssh.never-save-password|default'), true);
    assert.ok(!secrets.has(`obi|default|${HOST}|MAX`));

    info.resetHistory();
    await SSH_Tasks.connect();
    await flush();
    assert.ok(!info.getCalls().some(call => /password/.test(String(call.args[0]))));
  });


  test('clear messages for failed logins and unreachable hosts', async () => {
    user_config('ssh-key = "/keys/k"');
    failures.push(Object.assign(new Error('All configured authentication methods failed'), { level: 'client-authentication' }));
    await assert.rejects(() => SSH_Tasks.connect());
    assert.match(String(error.lastCall.args[0]), new RegExp(`^Login to MAX@${HOST} failed \\(check user, password or key\\)`));
    assert.ok(error.lastCall.args.includes('Open configuration'));

    failures.push(Object.assign(new Error(`connect ECONNREFUSED 127.0.0.1:22`), { code: 'ECONNREFUSED' }));
    await assert.rejects(() => SSH_Tasks.connect());
    assert.match(String(error.lastCall.args[0]), new RegExp(`^Can't reach ${HOST}:22`));
  });
});
