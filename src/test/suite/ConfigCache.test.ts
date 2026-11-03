import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AppConfig } from '../../extension/config/AppConfig';
import { Constants } from '../../shared/Constants';
import { HealthyWatchdog } from '../../extension/utilities/HealthyWatchdog';
import { Workspace } from '../../extension/utilities/Workspace';
import { BuildHistoryProvider } from '../../webview/build_history/BuildHistoryProvider';
import { SourceListProvider } from '../../webview/source_list/SourceListProvider';
import { reset_workspace } from './workspace_fixture';
import { FILE_CALLBACKS } from '../../file_callbacks';


const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function in_workspace(...parts: string[]): string {
  return path.join(Workspace.get_workspace(), ...parts);
}


suite('Config cache and file watcher callbacks', () => {

  setup(async () => {
    await reset_workspace();
    AppConfig.reset();
    HealthyWatchdog.callbacks = FILE_CALLBACKS;
  });

  teardown(() => sinon.restore());


  test('the config is read again only after a file changed, without reset', () => {
    const first = AppConfig.get_app_config();
    assert.strictEqual(AppConfig.get_app_config(), first, 'unchanged files: same object');

    const file = in_workspace(Constants.OBI_APP_CONFIG_FILE);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('#remote-host = "my.ibmi.host"', 'remote-host = "changed.host"'));
    const second = AppConfig.get_app_config();
    assert.notStrictEqual(second, first);
    assert.strictEqual(second.connection['remote-host'], 'changed.host');
  });


  test('switching the profile reads the user config of that profile', () => {
    fs.writeFileSync(in_workspace(Constants.OBI_APP_CONFIG_DIR, '.user-app-config-prod.toml'), '[connection]\nssh-user = "produser"\n');
    assert.strictEqual(AppConfig.get_app_config().connection['ssh-user'], undefined);

    fs.writeFileSync(in_workspace(Constants.OBI_WORKSPACE_SETTINGS_FILE), JSON.stringify({ current_profile: 'prod' }));
    assert.strictEqual(AppConfig.get_app_config().connection['ssh-user'], 'produser');
  });


  test('source config and workspace settings are cached the same way', () => {
    const source_configs = AppConfig.get_source_configs();
    assert.strictEqual(AppConfig.get_source_configs(), source_configs);
    fs.writeFileSync(in_workspace(Constants.OBI_SOURCE_CONFIG_FILE), '["lib/qrpglesrc/a.rpgle.pgm".settings]\nTGTRLS = "V7R5M0"\n');
    assert.strictEqual(AppConfig.get_source_configs()?.['lib/qrpglesrc/a.rpgle.pgm']?.settings?.['TGTRLS'], 'V7R5M0');

    assert.deepStrictEqual(Workspace.get_workspace_settings(), {});
    fs.writeFileSync(in_workspace(Constants.OBI_WORKSPACE_SETTINGS_FILE), JSON.stringify({ current_profile: '' }));
    assert.deepStrictEqual(Workspace.get_workspace_settings(), { current_profile: '' });
  });


  test('change_profile does not rewrite workspace-settings.json with the same profile', () => {
    const file = in_workspace(Constants.OBI_WORKSPACE_SETTINGS_FILE);
    fs.writeFileSync(file, JSON.stringify({ current_profile: '' }));
    const before = fs.statSync(file);

    Workspace.change_profile('');
    const after = fs.statSync(file);
    assert.strictEqual(after.ino, before.ino);
    assert.strictEqual(after.mtimeMs, before.mtimeMs);
  });


  test('callback patterns', () => {
    const patterns = (file: string) => HealthyWatchdog.callbacks_for(in_workspace(file)).map(callback => callback.pattern);
    assert.deepStrictEqual(patterns('.obi/etc/.user-app-config.toml'), ['.obi/etc/.user-app-config*.toml']);
    assert.deepStrictEqual(patterns('.obi/etc/.user-app-config-prod.toml'), ['.obi/etc/.user-app-config*.toml']);
    assert.deepStrictEqual(patterns('.obi/etc/app-config.toml'), ['.obi/etc/app-config.toml']);
    assert.deepStrictEqual(patterns('.obi/etc/workspace-settings.json'), ['.obi/etc/workspace-settings.json']);
    assert.strictEqual(patterns('.obi/source-list').length, 1, 'deleted folder');
    assert.strictEqual(patterns('.obi/source-list/All sources.json').length, 1);
    assert.strictEqual(patterns('.obi/build-history').length, 1, 'deleted folder');
    assert.strictEqual(patterns('.obi/build-history/2026-10-24').length, 1);
    assert.strictEqual(patterns('.obi/build-history/2026-10-24/compile-list.json').length, 1);
    assert.deepStrictEqual(patterns('.obi/build-history/2026-10-24/evfevent/a'), []);
    assert.deepStrictEqual(patterns('.obi/etc/sub/.user-app-config.toml'), []);
    assert.deepStrictEqual(patterns('.obi/tmp/changed-object-list.json'), []);
    assert.deepStrictEqual(patterns('../outside/.obi/etc/app-config.toml'), []);
  });


  test('a burst of build history events refreshes the history once; build output is ignored', async () => {
    const refresh = sinon.spy();
    sinon.stub(BuildHistoryProvider, 'get_instance').returns({ refresh } as unknown as BuildHistoryProvider);

    for (let i = 0; i < 50; i++) {
      HealthyWatchdog.run_callbacks(in_workspace(Constants.BUILD_HISTORY_DIR, 'new-build'));
      HealthyWatchdog.run_callbacks(in_workspace(Constants.BUILD_HISTORY_DIR, 'new-build', 'compile-list.json'));
      HealthyWatchdog.run_callbacks(in_workspace(Constants.BUILD_HISTORY_DIR, 'new-build', 'evfevent', `file${i}`));
    }
    HealthyWatchdog.run_callbacks(in_workspace(Constants.OBI_TMP_DIR, 'changed-object-list.json'));
    assert.strictEqual(refresh.callCount, 0, 'debounced');

    await wait(700);
    assert.strictEqual(refresh.callCount, 1);
  });


  test('a config file written with the same content runs no callback', async () => {
    const refresh = sinon.spy();
    sinon.stub(SourceListProvider, 'get_instance').returns({ refresh } as unknown as SourceListProvider);
    const file = in_workspace(Constants.SOURCE_INFOS);
    const on_file_event = (HealthyWatchdog as unknown as { on_file_event(file: string, event: string): Promise<void> }).on_file_event;

    fs.writeFileSync(file, '{"a": {}}');
    await on_file_event(file, 'changed');
    await wait(400);
    assert.strictEqual(refresh.callCount, 1);

    fs.writeFileSync(file, '{"a": {}}');
    await on_file_event(file, 'changed');
    await wait(400);
    assert.strictEqual(refresh.callCount, 1, 'same content');

    fs.writeFileSync(file, '{"b": {}}');
    await on_file_event(file, 'changed');
    await wait(400);
    assert.strictEqual(refresh.callCount, 2);
  });


  test('the watched globs: new build folders and history compile lists, no other history files', async function () {
    this.timeout(15000);
    const events: string[] = [];
    fs.mkdirSync(in_workspace(Constants.BUILD_HISTORY_DIR), { recursive: true });
    const watchers = HealthyWatchdog.WATCHED_FILES.map(glob => {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(Workspace.get_workspace_uri(), glob));
      watcher.onDidCreate(uri => events.push(path.relative(Workspace.get_workspace(), uri.fsPath).replace(/\\/g, '/')));
      watcher.onDidChange(uri => events.push(path.relative(Workspace.get_workspace(), uri.fsPath).replace(/\\/g, '/')));
      return watcher;
    });
    try {
      await wait(1000);   // watchers start asynchronously
      const until = async (file: string) => {
        for (let i = 0; i < 50 && !events.includes(file); i++)
          await wait(100);
      };
      // A new folder with content is one event for the folder (VS Code drops the events of its children)
      const build = in_workspace(Constants.BUILD_HISTORY_DIR, 'watch-test');
      fs.mkdirSync(path.join(build, 'evfevent'), { recursive: true });
      await until('.obi/build-history/watch-test');
      fs.writeFileSync(path.join(build, 'compile-list.json'), '{}');
      fs.writeFileSync(path.join(build, 'evfevent', 'a'), 'x');
      fs.mkdirSync(in_workspace(Constants.OBI_TMP_DIR), { recursive: true });
      fs.writeFileSync(in_workspace(Constants.OBI_TMP_DIR, 'watch-test.json'), '{}');
      fs.writeFileSync(in_workspace(Constants.OBI_CONFIGS_DIR, 'watch-test.toml'), '');
      await until('.obi/etc/watch-test.toml');
      await until('.obi/build-history/watch-test/compile-list.json');
      await wait(500);

      assert.ok(events.includes('.obi/build-history/watch-test'), events.join(', '));
      assert.ok(events.includes('.obi/build-history/watch-test/compile-list.json'), events.join(', '));
      assert.ok(events.includes('.obi/etc/watch-test.toml'), events.join(', '));
      assert.ok(!events.some(file => file.includes('evfevent') || file.startsWith('.obi/tmp')), events.join(', '));
    }
    finally {
      watchers.forEach(watcher => watcher.dispose());
    }
  });
});
