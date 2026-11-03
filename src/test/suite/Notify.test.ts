import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { NodeSSH } from 'node-ssh';
import { show_error } from '../../extension/utilities/Notify';
import { SSH_Tasks } from '../../extension/utilities/SSH_Tasks';
import { ConfigFileError, UserCancelledError, get_error_message } from '../../shared/Errors';


suite('Error messages', () => {

  let error_message: sinon.SinonStub;

  setup(() => {
    error_message = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
  });

  teardown(() => sinon.restore());


  test('message with cause and "Show log"', () => {
    show_error('Transfer failed', new Error('Permission denied'));
    assert.ok(error_message.calledOnceWith('Transfer failed: Permission denied', 'Show log'));
  });


  test('cancelled operations show nothing; the same error is shown once', () => {
    show_error('Build failed', new UserCancelledError());
    const error = new Error('x');
    show_error('Connection failed', error);
    show_error('Build failed', error);
    assert.strictEqual(error_message.callCount, 1);
  });


  test('config file errors offer to open the file; long causes are shortened', () => {
    show_error('Nothing was saved', new ConfigFileError('/ws/.obi/etc/app-config.toml', 3, 7, 'Invalid TOML'));
    assert.deepStrictEqual(error_message.firstCall.args.slice(1), ['Open file', 'Show log']);

    show_error('Failed', new Error('y'.repeat(1000)));
    assert.ok(String(error_message.secondCall.args[0]).length <= 300);
  });


  test('a failed SSH connection is reported once, also when the caller shows it again', async () => {
    sinon.stub(NodeSSH.prototype, 'isConnected').returns(false);
    sinon.stub(NodeSSH.prototype, 'connect').rejects(new Error('All configured authentication methods failed'));
    sinon.stub(vscode.window, 'showInputBox').onFirstCall().resolves('obi-test-host.invalid').onSecondCall().resolves('MAX');
    const original_context = SSH_Tasks.context;
    SSH_Tasks.context = { globalState: { get: () => undefined }, secrets: { get: async () => 'pw' } } as unknown as vscode.ExtensionContext;

    try {
      await SSH_Tasks.connect();
      assert.fail('connect should fail');
    }
    catch (e: unknown) {
      assert.strictEqual(get_error_message(e), 'All configured authentication methods failed');
      show_error('Build failed', e);
    }
    finally {
      SSH_Tasks.context = original_context;
    }

    assert.strictEqual(error_message.callCount, 1);
    assert.match(String(error_message.firstCall.args[0]), /^Login to MAX@obi-test-host\.invalid failed \(check user, password or key\): All configured/);
  });


  test('get_error_message for non-Error values', () => {
    assert.strictEqual(get_error_message('plain'), 'plain');
    assert.strictEqual(get_error_message({ code: 1 }), '{"code":1}');
    assert.strictEqual(get_error_message(undefined), 'undefined');
  });
});
