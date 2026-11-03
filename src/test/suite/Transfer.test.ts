import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { NodeSSH } from 'node-ssh';
import { SSH_Tasks } from '../../extension/utilities/SSH_Tasks';
import { OBICommands } from '../../extension/obi/OBICommands';
import { OBITools } from '../../extension/utilities/OBITools';
import { DirTool } from '../../extension/utilities/DirTool';
import { Workspace } from '../../extension/utilities/Workspace';
import { AppConfig } from '../../extension/config/AppConfig';
import { Constants } from '../../shared/Constants';
import { result_download_plan } from '../../extension/obi/ResultDownload';
import { TransferError } from '../../shared/Errors';
import { reset_workspace } from './workspace_fixture';


suite('Transfers report failures', () => {

  setup(async () => {
    await reset_workspace();
    SSH_Tasks.reset_connection_state();
    sinon.stub(SSH_Tasks, 'connect').resolves();
    sinon.stub(SSH_Tasks, 'get_ssh_user').resolves('MAX');
  });

  teardown(() => sinon.restore());


  test('a failed file in a directory download is returned', async () => {
    sinon.stub(NodeSSH.prototype, 'getDirectory').callsFake(async (_local: string, _remote: string, options?: { tick?: (l: string, r: string, e: Error | null) => void }) => {
      options?.tick?.('/l/a', '/r/a', null);
      options?.tick?.('/l/b', '/r/b', new Error('Permission denied'));
      return false;
    });

    const result = await SSH_Tasks.getRemoteDir(path.join(Workspace.get_workspace(), 'x'), '/r');
    assert.strictEqual(result.transferred, 1);
    assert.deepStrictEqual(result.failed.map(f => f.path), ['/r/b']);
  });


  test('TransferError states failed and total count', () => {
    const error = new TransferError({ transferred: 8, failed: [{ path: 'a', error: 'x' }, { path: 'b', error: 'y' }] }, '/r');
    assert.strictEqual(error.message, '2 of 10 files could not be transferred to /r: a, b');
  });


  test('build upload: the user config goes up separately with mode 600, never in the normal file list', async () => {
    const put_files = sinon.stub(NodeSSH.prototype, 'putFiles').resolves();
    const put_file = sinon.stub(NodeSSH.prototype, 'putFile').resolves();
    const exec = sinon.stub(NodeSSH.prototype, 'execCommand').resolves({ code: 0, stdout: '/home/MAX', stderr: '', signal: null });
    sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);

    await SSH_Tasks.transferSources(['prouzalib/qrpglesrc/hello.rpgle.pgm']);

    const uploaded = put_files.firstCall.args[0].map((f: { remote: string }) => f.remote);
    assert.ok(!uploaded.some((remote: string) => remote.includes('.user-app-config')), uploaded.join(', '));
    assert.ok(put_file.calledOnce && String(put_file.firstCall.args[1]).endsWith('/.obi/etc/.user-app-config.toml'));
    assert.deepStrictEqual(put_file.firstCall.args[3], { mode: 0o600 });
    assert.ok(exec.getCalls().some(call => String(call.args[0]).includes('chmod 600 --')));
  });


  test('if compile-list.json cannot be downloaded, neither history nor object-builds.json are written', async () => {
    sinon.stub(SSH_Tasks, 'getRemoteFile').rejects(new Error('No such file'));
    const get_dir = sinon.stub(SSH_Tasks, 'download_build_results').resolves([]);
    const write_compile_list = sinon.spy(OBITools, 'write_compile_list');
    const update_json = sinon.spy(DirTool, 'update_json');

    await assert.rejects(() => OBICommands.get_remote_build_output(), /Build results could not be downloaded/);
    assert.ok(get_dir.notCalled);
    assert.ok(write_compile_list.notCalled);
    assert.ok(update_json.notCalled);
  });


  test('after a build only the results of the built sources are downloaded, over one SFTP channel', async () => {
    const compile_list = { compiles: [{ level: 1, sources: [
      { source: 'lib/qrpglesrc/a.rpgle.pgm', cmds: [{ status: 'failed' }] },
      { source: 'lib/qrpglesrc/b.rpgle.pgm', cmds: [{ status: 'success' }] }
    ] }] };
    const plan = result_download_plan(compile_list, { 'build-output-dir': '.obi/build-output/objects', 'evfevent-output-dir': '.obi/tmp/evfevent' });

    const exec = sinon.stub(NodeSSH.prototype, 'execCommand').callsFake(async (cmd: string) => cmd.includes('for p in')
      // Only a has compile messages; both have outputs
      ? { code: 0, stdout: '.obi/build-output/objects/lib/a.rpgle.pgm\n.obi/build-output/objects/lib/b.rpgle.pgm\n.obi/tmp/evfevent/lib/qrpglesrc/a.rpgle.pgm\n', stderr: '', signal: null }
      : { code: 0, stdout: '/home/MAX', stderr: '', signal: null });
    const sftp = { end: sinon.spy() };
    sinon.stub(NodeSSH.prototype, 'requestSFTP').resolves(sftp as never);
    const dirs: string[] = [];
    sinon.stub(NodeSSH.prototype, 'getDirectory').callsFake(async (_local: string, remote: string, options?: { recursive?: boolean; sftp?: unknown }) => {
      assert.strictEqual(options?.sftp, sftp);
      dirs.push(`${remote}${options?.recursive === false ? ' (files)' : ''}`);
      return true;
    });
    const get_file = sinon.stub(NodeSSH.prototype, 'getFile').resolves();

    const results = await SSH_Tasks.download_build_results(plan);

    // remote-base-dir = "${workspaceFolderBasename}": relative to the login directory
    const base = path.basename(Workspace.get_workspace());
    assert.deepStrictEqual(dirs.sort(), [
      `${base}/.obi/build-output (files)`,
      `${base}/.obi/build-output/objects/lib/a.rpgle.pgm`,
      `${base}/.obi/build-output/objects/lib/b.rpgle.pgm`,
      `${base}/.obi/log`,
      `${base}/.obi/tmp (files)`
    ]);
    assert.deepStrictEqual(get_file.getCalls().map(call => call.args[1]), [`${base}/.obi/tmp/evfevent/lib/qrpglesrc/a.rpgle.pgm`]);
    assert.strictEqual(get_file.firstCall.args[2], sftp);
    assert.ok(sftp.end.calledOnce);
    assert.strictEqual(exec.getCalls().filter(call => String(call.args[0]).includes('for p in')).length, 1, 'one check for all optional files');
    assert.deepStrictEqual(results.flatMap(result => result.failed), []);
  });


  test('the build list upload sends the files of .obi/tmp, not the compile messages of earlier builds', async () => {
    const tmp = path.join(Workspace.get_workspace(), Constants.OBI_TMP_DIR);
    fs.mkdirSync(path.join(tmp, 'evfevent', 'lib', 'qrpglesrc'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'changed-object-list.json'), '{}');
    fs.writeFileSync(path.join(tmp, 'evfevent', 'lib', 'qrpglesrc', 'a.rpgle.pgm'), 'x');
    sinon.stub(NodeSSH.prototype, 'execCommand').resolves({ code: 0, stdout: '/home/MAX', stderr: '', signal: null });
    const put_files = sinon.stub(NodeSSH.prototype, 'putFiles').resolves();

    await OBICommands.transfer_build_list({ report: () => undefined });

    const uploaded = put_files.getCalls().flatMap(call => call.args[0].map((file: { remote: string }) => file.remote));
    assert.ok(uploaded.some(remote => remote.endsWith('/.obi/build-output/compile-list.json')), uploaded.join(', '));
    assert.ok(uploaded.some(remote => remote.endsWith('/.obi/tmp/changed-object-list.json')), uploaded.join(', '));
    assert.ok(!uploaded.some(remote => remote.includes('evfevent')), uploaded.join(', '));
  });


  test('ssh-concurrency of the configuration is used (bugs.md #12)', async () => {
    const file = path.join(Workspace.get_workspace(), Constants.OBI_APP_CONFIG_FILE);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('[connection]', '[connection]\nssh-concurrency = 12'));
    assert.strictEqual(AppConfig.get_app_config().connection['ssh-concurrency'], 12);

    const get_directory = sinon.stub(NodeSSH.prototype, 'getDirectory').resolves(true);
    await SSH_Tasks.getRemoteDir(path.join(Workspace.get_workspace(), 'x'), '/r');
    assert.strictEqual(get_directory.firstCall.args[2]?.concurrency, 12);
  });
});
