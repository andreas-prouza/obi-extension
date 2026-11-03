import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AppConfig } from '../../extension/config/AppConfig';
import { Constants } from '../../shared/Constants';
import { OBICommands } from '../../extension/obi/OBICommands';
import { Workspace } from '../../extension/utilities/Workspace';
import { BuildSummary } from '../../webview/show_changes/BuildSummary';
import { reset_workspace } from './workspace_fixture';


const fake_webview = { asWebviewUri: (uri: vscode.Uri) => uri, cspSource: 'vscode-resource:' } as unknown as vscode.Webview;

function config_for(user: string, host: string): AppConfig {
  return {
    connection: { 'ssh-user': user, 'remote-host': host },
    general: { 'remote-base-dir': '/home/obi/project' },
    global: { variables: { TARGET_LIB: 'PRD', secret_password: 'top-secret' } },
    profiles: { dev: { global: { variables: { SECRET_TOKEN: 'abc', DEBUG: 'yes' } } } }
  } as unknown as AppConfig;
}

const compile_list = { timestamp: '2026-10-24T10:00:00.000000', compiles: [] };


suite('Build history config snapshot', () => {

  setup(async () => {
    await reset_workspace();
    // The fixture has no remote host: without it the summary shows no compile list
    sinon.stub(AppConfig, 'attributes_missing').returns(false);
  });

  teardown(() => {
    sinon.restore();
    BuildSummary['_current_compile_output_folder'] = undefined;
  });


  test('the history gets config.json without secret* variables, the compile list no config', () => {
    const ws = Workspace.get_workspace();
    const dir_name = OBICommands.write_build_history(ws, { ...compile_list }, config_for('builder', 'ibmi.example'));
    const dir = path.join(ws, Constants.BUILD_HISTORY_DIR, dir_name);

    const history_list = JSON.parse(fs.readFileSync(path.join(dir, 'compile-list.json'), 'utf8'));
    assert.strictEqual(history_list.config, undefined);

    const raw = fs.readFileSync(path.join(dir, Constants.BUILD_HISTORY_CONFIG_FILE), 'utf8');
    assert.ok(!raw.includes('top-secret') && !raw.includes('abc'));
    const snapshot = JSON.parse(raw);
    assert.deepStrictEqual(snapshot.global.variables, { TARGET_LIB: 'PRD' });
    assert.deepStrictEqual(snapshot.profiles.dev.global.variables, { DEBUG: 'yes' });
    assert.strictEqual(snapshot.connection['remote-host'], 'ibmi.example');
  });


  test('the build summary of a history entry shows the host of config.json', () => {
    const ws = Workspace.get_workspace();
    const dir_name = OBICommands.write_build_history(ws, { ...compile_list }, config_for('builder', 'ibmi.example'));
    BuildSummary['_current_compile_output_folder'] = path.join(Constants.BUILD_HISTORY_DIR, dir_name);

    const html: string = BuildSummary['generate_html'](vscode.Uri.file(Constants.EXTENSION_ROOT), fake_webview);
    assert.ok(html.includes('builder@ibmi.example'));
  });


  test('older history entries with the config in the compile list still show their host', () => {
    const dir = path.join(Constants.BUILD_HISTORY_DIR, 'old-build');
    fs.mkdirSync(path.join(Workspace.get_workspace(), dir), { recursive: true });
    fs.writeFileSync(path.join(Workspace.get_workspace(), dir, 'compile-list.json'),
      JSON.stringify({ ...compile_list, config: config_for('olduser', 'old.host') }));
    BuildSummary['_current_compile_output_folder'] = dir;

    const html: string = BuildSummary['generate_html'](vscode.Uri.file(Constants.EXTENSION_ROOT), fake_webview);
    assert.ok(html.includes('olduser@old.host'));
  });
});
