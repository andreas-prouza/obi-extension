import assert from 'assert';
import * as fs from 'fs';
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


const KEY = Buffer.from('AAAAC3NzaC1lZDI1NTE5AAAAIOp9qDOrXmsElM8aprk7Otak2OLciTi7vda2Hhg8Nr4r', 'base64');
const TYPED_HOST = 'obi-typed-host.invalid';


function memento(): vscode.Memento {
  const data = new Map<string, unknown>();
  return {
    keys: () => [...data.keys()],
    get: (key: string, default_value?: unknown) => data.has(key) ? data.get(key) : default_value,
    update: async (key: string, value: unknown) => { data.set(key, value); }
  } as unknown as vscode.Memento;
}


/** Host and user that are not in the config are asked for once per session and profile (improvements v2.2.3 R3) */
suite('SSH session: host and user', () => {

  const original_context = SSH_Tasks.context;
  let configs: Config[];
  let failures: Error[];
  let open: boolean;
  let input: sinon.SinonStub;

  /** Titles of the input boxes shown so far: host, user, password */
  const asked = () => input.getCalls().map(call => {
    const title = String(call.args[0]?.title ?? '');
    return /hostname/.test(title) ? 'host' : /user for/.test(title) ? 'user' : /password/.test(title) ? 'password' : title;
  });

  function user_config(file: string, connection: string): void {
    fs.writeFileSync(path.join(Workspace.get_workspace(), Constants.OBI_APP_CONFIG_DIR, file), `[connection]\n${connection}\n`);
    AppConfig.reset();
  }

  setup(async () => {
    await reset_workspace();
    AppConfig.reset();
    const global_state = memento();
    SSH_Tasks.context = {
      globalState: global_state,
      workspaceState: memento(),
      secrets: { get: async () => undefined, store: async () => undefined, delete: async () => undefined }
    } as unknown as vscode.ExtensionContext;
    for (const host of [TYPED_HOST, 'obi-config-host.invalid'])
      await global_state.update(`obi|hostkey|${host}:22`, { algorithm: 'ssh-ed25519', fingerprint: fingerprint(KEY), first_seen: '' });

    configs = [];
    failures = [];
    open = false;
    sinon.stub(NodeSSH.prototype, 'isConnected').callsFake(() => open);
    sinon.stub(NodeSSH.prototype, 'dispose').callsFake(() => { open = false; });
    sinon.stub(NodeSSH.prototype, 'connect').callsFake(async function (this: NodeSSH, config: Config) {
      configs.push(config);
      const failure = failures.shift();
      if (failure)
        throw failure;
      if (!(config.hostVerifier as (key: Buffer) => boolean)(KEY))
        throw new Error('host key');
      open = true;
      return this;
    });
    input = sinon.stub(vscode.window, 'showInputBox').callsFake(async options => {
      const title = String(options?.title ?? '');
      return /hostname/.test(title) ? TYPED_HOST : /user for/.test(title) ? 'TYPED' : 'pw';
    });
    sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    SSH_Tasks.disconnect();
  });

  teardown(() => {
    SSH_Tasks.disconnect();
    sinon.restore();
    SSH_Tasks.context = original_context;
    Workspace.change_profile('');
  });


  test('a configured user is used without asking, also before the first connection', async () => {
    user_config(Constants.OBI_APP_CONFIG_USER, 'remote-host = "obi-config-host.invalid"\nssh-user = "MAX"');

    assert.strictEqual(await SSH_Tasks.get_ssh_user(), 'MAX');
    assert.deepStrictEqual(asked(), []);
  });


  test('typed host and user: asked once; the open connection is used again, a lost one is opened again without asking', async () => {
    await SSH_Tasks.connect();
    assert.deepStrictEqual(asked(), ['host', 'user', 'password']);
    assert.strictEqual(configs[0].host, TYPED_HOST);
    assert.strictEqual(configs[0].username, 'TYPED');

    await SSH_Tasks.connect();
    assert.strictEqual(configs.length, 1, 'no new connection');
    assert.strictEqual(await SSH_Tasks.get_ssh_user(), 'TYPED');
    assert.deepStrictEqual(asked(), ['host', 'user', 'password']);

    open = false;   // connection lost
    await SSH_Tasks.connect();
    assert.strictEqual(configs.length, 2);
    assert.strictEqual(configs[1].host, TYPED_HOST);
    assert.strictEqual(configs[1].username, 'TYPED');
    assert.deepStrictEqual(asked(), ['host', 'user', 'password', 'password'], 'only the password (not saved) again');
  });


  test('a failed connection asks for the typed host and user again', async () => {
    failures.push(new Error('getaddrinfo ENOTFOUND obi-typed-host.invalid'));

    await assert.rejects(() => SSH_Tasks.connect());
    await SSH_Tasks.connect();
    assert.deepStrictEqual(asked(), ['host', 'user', 'password', 'host', 'user', 'password']);
  });


  test('typed values belong to the profile; a value in the config wins', async () => {
    await SSH_Tasks.connect();
    assert.strictEqual(await SSH_Tasks.get_ssh_user(), 'TYPED');

    user_config('.user-app-config-dev.toml', 'remote-host = "obi-config-host.invalid"');
    Workspace.change_profile('dev');
    input.resetHistory();
    assert.strictEqual(await SSH_Tasks.get_ssh_user(), 'TYPED');
    assert.deepStrictEqual(asked(), ['user'], 'the user of the default profile is not used for dev');

    await SSH_Tasks.connect();
    assert.strictEqual(configs.at(-1)?.host, 'obi-config-host.invalid', 'reconnected to the host of dev');

    user_config('.user-app-config-dev.toml', 'remote-host = "obi-config-host.invalid"\nssh-user = "FROMCONFIG"');
    assert.strictEqual(await SSH_Tasks.get_ssh_user(), 'FROMCONFIG');
  });
});
