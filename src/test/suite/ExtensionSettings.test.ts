import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ExtensionSettings } from '../../extension/utilities/ExtensionSettings';
import { OBICommands } from '../../extension/obi/OBICommands';
import { OBITools } from '../../extension/utilities/OBITools';
import { SSH_Tasks } from '../../extension/utilities/SSH_Tasks';
import { OperationLock } from '../../extension/utilities/OperationLock';
import { AppConfig } from '../../extension/config/AppConfig';
import { Constants } from '../../shared/Constants';


interface Manifest {
  contributes: {
    commands: { command: string }[];
    keybindings: { command: string; when: string }[];
    walkthroughs: { steps: { media: { markdown: string } }[] }[];
  };
}

const manifest = JSON.parse(fs.readFileSync(path.join(Constants.EXTENSION_ROOT, 'package.json'), 'utf8')) as Manifest;


suite('Settings, walkthrough and keybindings', () => {

  teardown(async () => {
    sinon.restore();
    await vscode.workspace.getConfiguration('obi').update('build.confirmRun', undefined, vscode.ConfigurationTarget.Global);
  });


  test('defaults when nothing is configured', () => {
    assert.strictEqual(ExtensionSettings.log_write_files(), true);
    assert.strictEqual(ExtensionSettings.log_max_file_size_mb(), 5);
    assert.strictEqual(ExtensionSettings.build_reveal_output(), 'onError');
    assert.strictEqual(ExtensionSettings.build_confirm_run(), true);
    assert.strictEqual(ExtensionSettings.status_bar_enabled(), true);
    assert.strictEqual(ExtensionSettings.build_history_max_builds(), 100);
    assert.strictEqual(ExtensionSettings.build_history_max_age_days(), 0);
    assert.strictEqual(ExtensionSettings.build_history_limit_configured(), false);
  });


  async function run_until_remote_check(): Promise<sinon.SinonStub> {
    const question = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    sinon.stub(AppConfig, 'get_app_config').returns({ general: { 'remote-base-dir': 'proj', 'remote-obi-dir': '/obi' }, connection: { 'remote-host': 'host' } } as unknown as AppConfig);
    sinon.stub(OBITools, 'get_remote_obi_python_path').resolves('/obi/venv/bin/python');
    const pase = sinon.stub(OBITools, 'check_remote_pase').resolves(false);
    sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    sinon.stub(SSH_Tasks, 'connect').resolves();
    sinon.stub(OperationLock, 'token').get(() => new vscode.CancellationTokenSource().token);
    await OBICommands.run_build_process(['lib/qrpglesrc/a.rpgle.pgm'], false).catch(() => undefined);
    return Object.assign(question, { pase });
  }


  test('obi.build.confirmRun: the question before a build can be turned off', async () => {
    const asked = await run_until_remote_check();
    assert.ok(asked.calledOnce, 'asks by default');
    assert.ok((asked as unknown as { pase: sinon.SinonStub }).pase.notCalled, 'not confirmed: nothing happens');
    sinon.restore();

    await vscode.workspace.getConfiguration('obi').update('build.confirmRun', false, vscode.ConfigurationTarget.Global);
    const not_asked = await run_until_remote_check();
    assert.ok(not_asked.notCalled);
    assert.ok((not_asked as unknown as { pase: sinon.SinonStub }).pase.calledOnce, 'the build goes on');
  });


  test('the walkthrough files and the commands of the keybindings exist', () => {
    const commands = manifest.contributes.commands.map(command => command.command);
    for (const step of manifest.contributes.walkthroughs[0].steps)
      assert.ok(fs.existsSync(path.join(Constants.EXTENSION_ROOT, step.media.markdown)), step.media.markdown);
    for (const binding of manifest.contributes.keybindings) {
      assert.ok(commands.includes(binding.command), binding.command);
      assert.ok(binding.when.includes('editorTextFocus'), 'not in the file explorer, where VS Code uses the same keys');
    }
  });
});
