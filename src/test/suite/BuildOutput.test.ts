import assert from 'assert';
import type { ClientChannel } from 'ssh2';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { NodeSSH, SSHExecCommandResponse, SSHExecCommandOptions } from 'node-ssh';
import { SSH_Tasks } from '../../extension/utilities/SSH_Tasks';
import { OBICommands } from '../../extension/obi/OBICommands';
import { OperationLock } from '../../extension/utilities/OperationLock';
import { UserCancelledError } from '../../shared/Errors';


type ExecOptions = SSHExecCommandOptions;

const ok = (stdout = ''): SSHExecCommandResponse => ({ code: 0, stdout, stderr: '', signal: null });


suite('Live build output and cancellation', () => {

  setup(() => {
    sinon.stub(SSH_Tasks, 'connect').resolves();
  });

  teardown(() => sinon.restore());


  test('output arrives line by line, also with a character split across chunks', async () => {
    sinon.stub(NodeSSH.prototype, 'execCommand').callsFake(async (_cmd: string, options?: ExecOptions) => {
      const umlaut = Buffer.from('ä', 'utf8');
      options?.onStdout?.(Buffer.concat([Buffer.from('compile '), umlaut.subarray(0, 1)]));
      options?.onStdout?.(Buffer.concat([umlaut.subarray(1), Buffer.from(' ok\nlast')]));
      options?.onStderr?.(Buffer.from('warning\n'));
      return ok();
    });

    const lines: string[] = [];
    await SSH_Tasks.execute_streaming('run', { on_line: (line, stream) => lines.push(`${stream}:${line}`) });
    assert.deepStrictEqual(lines, ['stdout:compile ä ok', 'stderr:warning', 'stdout:last']);
  });


  test('cancel stops the remote process by its pid and rejects with UserCancelledError', async () => {
    const source = new vscode.CancellationTokenSource();
    let close_channel: () => void = () => undefined;
    const exec = sinon.stub(NodeSSH.prototype, 'execCommand').callsFake(async (cmd: string, options?: ExecOptions) => {
      if (cmd.startsWith('kill'))
        return ok();
      // The remote build: prints its pid, then runs until the channel is closed
      return new Promise(resolve => {
        options?.onChannel?.({ close: () => resolve({ code: 143, stdout: '', stderr: '', signal: null }) } as unknown as ClientChannel);
        options?.onStdout?.(Buffer.from('OBI_PID:12345\ncompiling a\n'));
        close_channel = () => resolve(ok());
      });
    });

    const lines: string[] = [];
    const running = SSH_Tasks.execute_streaming('run', { report_pid: true, token: source.token, on_line: line => lines.push(line) });
    await new Promise(resolve => setTimeout(resolve, 10));
    source.cancel();

    await assert.rejects(() => running, UserCancelledError);
    assert.ok(exec.getCalls().some(call => call.args[0] === 'kill -TERM 12345'));
    assert.deepStrictEqual(lines, ['compiling a'], 'the pid line is not shown');
    close_channel();
  });


  test('the remote run reports its pid and keeps it for Python (exec)', async () => {
    sinon.stub(SSH_Tasks, 'get_remote_base_dir').resolves('/home/MAX/proj');
    sinon.stub(SSH_Tasks, 'get_remote_obi_dir').resolves('/apps/obi');
    const cmd: string = await OBICommands['get_remote_obi_cmd']('run', undefined, true);
    assert.match(cmd, /echo "OBI_PID:\$\$"; exec '\/apps\/obi\/.+python[^']*' -X utf8 '\/apps\/obi\/main\.py' -a run -p \.$/);
  });


  test('the operation token is cancelled by OperationLock.cancel and replaced after the operation', async () => {
    let seen: vscode.CancellationToken | undefined;
    await OperationLock.run('Test', async token => {
      seen = token;
      assert.strictEqual(OperationLock.token, token);
      OperationLock.cancel();
    });
    assert.ok(seen?.isCancellationRequested);
    assert.strictEqual(OperationLock.token.isCancellationRequested, false);
  });
});
