import assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { NodeSSH, SSHExecCommandResponse } from 'node-ssh';
import { SSH_Tasks } from '../../extension/utilities/SSH_Tasks';
import { Workspace } from '../../extension/utilities/Workspace';
import { OBITools } from '../../extension/utilities/OBITools';
import { UserCancelledError } from '../../shared/Errors';


function response(stdout: string, code: number = 0): SSHExecCommandResponse {
  return { code, stdout, stderr: '', signal: null };
}


suite('SSH_Tasks remote paths and commands', () => {

  let exec: sinon.SinonStub;
  const ws_name = () => path.basename(Workspace.get_workspace());

  setup(() => {
    SSH_Tasks.reset_connection_state();
    sinon.stub(SSH_Tasks, 'connect').resolves();
    sinon.stub(SSH_Tasks, 'get_ssh_user').resolves('MAX');
    exec = sinon.stub(NodeSSH.prototype, 'execCommand');
  });

  teardown(() => {
    sinon.restore();
    SSH_Tasks.reset_connection_state();
  });


  test('leading ~ expands to $HOME of the SSH user, other placeholders are replaced everywhere', async () => {
    exec.withArgs('printf %s "$HOME"').resolves(response('/users/MAX'));

    assert.strictEqual(await SSH_Tasks.get_finalized_remote_path('~/proj'), '/users/MAX/proj');
    assert.strictEqual(await SSH_Tasks.get_finalized_remote_path('~'), '/users/MAX');
    assert.strictEqual(await SSH_Tasks.get_finalized_remote_path('my~proj'), 'my~proj');
    assert.strictEqual(await SSH_Tasks.get_finalized_remote_path('/home/$USER/x'), '/home/MAX/x');
    assert.strictEqual(await SSH_Tasks.get_finalized_remote_path('/home/$USERNAME'), '/home/$USERNAME');
    assert.strictEqual(
      await SSH_Tasks.get_finalized_remote_path('${workspaceFolderBasename}/x/${workspaceFolderBasename}'),
      `${ws_name()}/x/${ws_name()}`);
  });


  test('empty $HOME falls back to /home/<user>', async () => {
    exec.withArgs('printf %s "$HOME"').resolves(response(''));
    assert.strictEqual(await SSH_Tasks.get_remote_home(), '/home/MAX');
  });


  test('get_finalized_command quotes the whole command for bash -c', () => {
    assert.strictEqual(SSH_Tasks.get_finalized_command(`cd '/a b' && pwd`), `bash -c 'cd '\\''/a b'\\'' && pwd'`);
  });


  test('cleanup_directory refuses to delete the home directory', async () => {
    exec.withArgs('printf %s "$HOME"').resolves(response('/home/MAX'));
    exec.callsFake(async (cmd: string) => cmd.includes('pwd -P') ? response('/home/MAX') : response('/home/MAX'));
    const error_message = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);

    assert.strictEqual(await SSH_Tasks.cleanup_directory(), false);
    assert.ok(error_message.calledOnce);
    assert.ok(!exec.getCalls().some(call => String(call.args[0]).includes('rm -rf')), 'rm -rf must not be executed');
  });


  test('cleanup_directory deletes a confirmed project folder with a quoted absolute path', async () => {
    exec.callsFake(async (cmd: string) => {
      if (cmd === 'printf %s "$HOME"') return response('/home/MAX');
      if (cmd.includes('pwd -P')) return response('/home/MAX/my proj\n');
      return response('');                                    // marker test -f and rm -rf succeed
    });
    sinon.stub(vscode.window, 'showWarningMessage').resolves('Delete and transfer' as unknown as vscode.MessageItem);

    assert.strictEqual(await SSH_Tasks.cleanup_directory(), true);
    const rm = exec.getCalls().map(call => String(call.args[0])).filter(cmd => cmd.includes('rm -rf'));
    assert.deepStrictEqual(rm, [`bash -c 'rm -rf -- '\\''/home/MAX/my proj'\\'''`]);
  });


  test('cleanup_directory does nothing if the user cancels', async () => {
    exec.callsFake(async (cmd: string) => {
      if (cmd === 'printf %s "$HOME"') return response('/home/MAX');
      if (cmd.includes('pwd -P')) return response('/home/MAX/proj');
      return response('');
    });
    sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);

    await assert.rejects(() => SSH_Tasks.cleanup_directory(), UserCancelledError);
    assert.ok(!exec.getCalls().some(call => String(call.args[0]).includes('rm -rf')));
  });


  test('connect options: keepalive in milliseconds, explicit ready timeout, host key verifier', () => {
    const verifier = () => true;
    const config = SSH_Tasks.build_connect_config({ host: 'host', port: 22, username: 'user', password: 'pwd' }, verifier);
    assert.strictEqual(config.hostVerifier, verifier);
    assert.strictEqual(config.port, 22);
    assert.deepStrictEqual(config.authHandler, ['none', 'password']);
    assert.strictEqual(config.keepaliveInterval, 60000);
    assert.strictEqual(config.keepaliveCountMax, 3);
    assert.strictEqual(config.readyTimeout, 30000);
  });


  test('cancelled transfer: no error message, and check_remote reports failure', async () => {
    sinon.stub(OBITools, 'check_remote_basics').resolves(false);
    sinon.stub(OBITools, 'process_transfer_project_folder').rejects(new UserCancelledError());
    const error_message = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);

    assert.strictEqual(await OBITools.check_remote(), false);
    assert.ok(error_message.notCalled);
  });


});
