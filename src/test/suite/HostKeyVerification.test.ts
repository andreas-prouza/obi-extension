import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Config, NodeSSH } from 'node-ssh';
import { SSH_Tasks } from '../../extension/utilities/SSH_Tasks';
import { HostKeyStore } from '../../extension/utilities/HostKeyStore';
import { fingerprint } from '../../extension/utilities/HostKey';
import { HostKeyError, UserCancelledError } from '../../shared/Errors';


const HOST = 'obi-test-host.invalid';
const KEY_1 = Buffer.from('AAAAC3NzaC1lZDI1NTE5AAAAIOp9qDOrXmsElM8aprk7Otak2OLciTi7vda2Hhg8Nr4r', 'base64');
const KEY_2 = Buffer.from('AAAAC3NzaC1lZDI1NTE5AAAAINXSvTvbZomLvKSnPjG9i58W8ZmqT59Kor4UYqhpt7Ri', 'base64');


function fake_memento(): vscode.Memento {
  const data = new Map<string, unknown>();
  return {
    keys: () => [...data.keys()],
    get: (key: string, default_value?: unknown) => data.has(key) ? data.get(key) : default_value,
    update: async (key: string, value: unknown) => { if (value === undefined) data.delete(key); else data.set(key, value); }
  } as unknown as vscode.Memento;
}


suite('SSH host key verification', () => {

  let state: vscode.Memento;
  let presented: Buffer;
  let connect: sinon.SinonStub;
  let warning: sinon.SinonStub;
  let error: sinon.SinonStub;
  let known_hosts_dir: string;
  const original_context = SSH_Tasks.context;
  const original_known_hosts = HostKeyStore.known_hosts_file;

  setup(() => {
    state = fake_memento();
    presented = KEY_1;
    SSH_Tasks.context = { globalState: state, secrets: { get: async () => 'pw' } } as unknown as vscode.ExtensionContext;
    known_hosts_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-known-hosts-'));
    HostKeyStore.known_hosts_file = path.join(known_hosts_dir, 'known_hosts');

    sinon.stub(vscode.window, 'showInputBox').onFirstCall().resolves(HOST).onSecondCall().resolves('MAX');
    sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    sinon.stub(NodeSSH.prototype, 'isConnected').returns(false);
    warning = sinon.stub(vscode.window, 'showWarningMessage');
    error = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    // Like ssh2: the handshake fails if the verifier rejects the key
    connect = sinon.stub(NodeSSH.prototype, 'connect').callsFake(async function (this: NodeSSH, config: Config) {
      const verifier = config.hostVerifier as (key: Buffer) => boolean;
      if (!verifier(presented))
        throw new Error('Handshake failed: host key verification failed');
      return this;
    });
  });

  teardown(() => {
    sinon.restore();
    SSH_Tasks.context = original_context;
    HostKeyStore.known_hosts_file = original_known_hosts;
    fs.rmSync(known_hosts_dir, { recursive: true, force: true });
  });


  test('first connection: asks, stores the fingerprint and connects again', async () => {
    warning.resolves('Trust and connect');
    await SSH_Tasks.connect();

    assert.strictEqual(connect.callCount, 2);
    assert.ok(String(warning.firstCall.args[1].detail).includes(fingerprint(KEY_1)));
    assert.strictEqual(HostKeyStore.get(state, HOST, 22)?.fingerprint, fingerprint(KEY_1));
  });


  test('known host with the same key: connects without asking', async () => {
    await state.update(`obi|hostkey|${HOST}:22`, { algorithm: 'ssh-ed25519', fingerprint: fingerprint(KEY_1), first_seen: '' });
    await SSH_Tasks.connect();

    assert.strictEqual(connect.callCount, 1);
    assert.ok(warning.notCalled);
  });


  test('changed key: modal warning, no connection, HostKeyError', async () => {
    await state.update(`obi|hostkey|${HOST}:22`, { algorithm: 'ssh-ed25519', fingerprint: fingerprint(KEY_2), first_seen: '' });

    await assert.rejects(() => SSH_Tasks.connect(), HostKeyError);
    assert.strictEqual(connect.callCount, 1);
    assert.ok(error.calledOnce, 'only the modal, no second error message');
    assert.deepStrictEqual(error.firstCall.args[1].modal, true);
    assert.strictEqual(HostKeyStore.get(state, HOST, 22)?.fingerprint, fingerprint(KEY_2), 'stored key is kept');
  });


  test('not trusted: UserCancelledError, nothing stored', async () => {
    warning.resolves(undefined);

    await assert.rejects(() => SSH_Tasks.connect(), UserCancelledError);
    assert.strictEqual(connect.callCount, 1);
    assert.strictEqual(HostKeyStore.get(state, HOST, 22), undefined);
  });


  test('a key from ~/.ssh/known_hosts is trusted, a different one there is a mismatch', async () => {
    fs.writeFileSync(HostKeyStore.known_hosts_file, `${HOST} ssh-ed25519 ${KEY_1.toString('base64')}\n`);
    await SSH_Tasks.connect();
    assert.ok(warning.notCalled);

    presented = KEY_2;
    assert.strictEqual(HostKeyStore.check(state, HOST, 22, KEY_2).decision, 'mismatch');
  });


  test('forget removes the selected host key', async () => {
    await state.update(`obi|hostkey|${HOST}:22`, { algorithm: 'ssh-ed25519', fingerprint: fingerprint(KEY_1), first_seen: new Date().toISOString() });
    sinon.stub(vscode.window, 'showQuickPick').callsFake(async (items: unknown) => (items as vscode.QuickPickItem[])[0]);
    warning.resolves('Forget');

    await HostKeyStore.forget(state);
    assert.strictEqual(HostKeyStore.get(state, HOST, 22), undefined);
  });
});
