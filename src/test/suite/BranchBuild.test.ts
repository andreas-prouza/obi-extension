import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AppConfig } from '../../extension/config/AppConfig';
import { BranchBuildConfig } from '../../extension/config/BranchBuildConfig';
import { BranchBuild, BranchBuildRefusal } from '../../extension/obi/BranchBuild';
import { BackendUpdate } from '../../extension/obi/BackendUpdate';
import { OBICommands } from '../../extension/obi/OBICommands';
import { OBITools } from '../../extension/utilities/OBITools';
import { SSH_Tasks } from '../../extension/utilities/SSH_Tasks';
import { Workspace } from '../../extension/utilities/Workspace';
import { DirTool } from '../../extension/utilities/DirTool';
import * as GitChanges from '../../extension/utilities/GitChanges';
import { BuildSummary } from '../../webview/show_changes/BuildSummary';
import { OBIConfiguration } from '../../webview/controller/OBIConfiguration';
import { ProjectState } from '../../extension/ProjectState';
import { Constants } from '../../shared/Constants';
import { reset_workspace } from './workspace_fixture';
import { BuildPackageCommands } from '../../webview/build_packages/BuildPackageCommands';
import { BuildPackageStore } from '../../extension/obi/BuildPackageStore';
import { ExtensionSettings } from '../../extension/utilities/ExtensionSettings';
import { BuildPackage } from '../../shared/BuildPackage';
import { manage_branch_libraries } from '../../extension/obi/BranchLibraries';
import { BuildHistoryProvider } from '../../webview/build_history/BuildHistoryProvider';


const SECTION = `\n[branch-build]\nticket-pattern = '(?i)\\bproj[-_](\\d+)'\nlib-name = "#$(ENV)_$(TICKET)"\n\n[branch-build.env]\nprouzalib = "PZ"\n`;
const BRANCH_LIST = { compiles: [], build_context: { mode: 'branch', branch: 'PROJ-337-order', ticket: '337', libs: ['#pz_337'] } };
const fake_webview = { asWebviewUri: (uri: vscode.Uri) => uri, cspSource: 'vscode-resource:' } as unknown as vscode.Webview;


/** Branch build in the extension (docs/features/obi-extension-branch-build-spec.md) */
suite('Branch build', () => {

  const ws = () => Workspace.get_workspace();
  const project_file = () => path.join(ws(), Constants.OBI_APP_CONFIG_FILE);
  const user_file = () => path.join(ws(), Constants.OBI_APP_CONFIG_USER_FILE);
  const on = () => { fs.appendFileSync(project_file(), SECTION); AppConfig.reset(); };
  let local_obi: string;

  /** A local OBI folder with this backend version */
  function local_obi_version(version: number): void {
    fs.mkdirSync(path.join(local_obi, 'module'), { recursive: true });
    fs.writeFileSync(path.join(local_obi, 'module', 'obi_constants.py'), `class OBIConstants:\n    OBI_BACKEND_VERSION = ${version}\n`);
    sinon.stub(OBITools, 'without_local_obi').returns(false);
    sinon.stub(OBITools, 'get_local_obi_dir').returns(local_obi);
    const config = AppConfig.get_app_config();
    sinon.stub(AppConfig, 'get_app_config').returns({ ...config, general: { ...config.general, 'local-obi-dir': local_obi }, attributes_missing: () => false } as unknown as AppConfig);
  }

  setup(async () => {
    await reset_workspace();
    AppConfig.reset();
    local_obi = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-local-'));
  });

  teardown(() => {
    sinon.restore();
    fs.rmSync(local_obi, { recursive: true, force: true });
    AppConfig.reset();
  });


  test('active only with the section; enabled = false of the user config turns it off', () => {
    assert.strictEqual(BranchBuild.is_active(), false, 'fixture without [branch-build]');
    on();
    assert.strictEqual(BranchBuild.is_active(), true);
    assert.strictEqual(BranchBuildConfig.section()?.['lib-name'], '#$(ENV)_$(TICKET)');
    fs.writeFileSync(user_file(), '[branch-build]\nenabled = false\n');
    assert.strictEqual(BranchBuild.is_active(), false, 'false overrides, as in the backend');
  });


  test('saving the user configuration on the config page keeps its other sections', () => {
    fs.writeFileSync(user_file(), '[connection]\nssh-user = "MAX"\n\n[branch-build]\nenabled = false\n');
    sinon.stub(ProjectState, 'update').resolves();
    sinon.stub(OBITools, 'check_local_obi');
    sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);

    OBIConfiguration.save_config(true, Workspace.get_workspace_uri(), { connection: { 'remote-host': 'ibmi' } });

    const saved = DirTool.read_toml_strict<Record<string, Record<string, unknown>>>(user_file());
    assert.strictEqual(saved?.['connection']['remote-host'], 'ibmi');
    assert.deepStrictEqual({ ...saved?.['branch-build'] }, { enabled: false });
  });


  test('feature off: no --branch, no checks, also without a local OBI', async () => {
    sinon.stub(OBITools, 'without_local_obi').returns(true);
    sinon.stub(BranchBuild, 'current_branch').returns('PROJ-337-order');
    assert.deepStrictEqual(BranchBuild.args(), []);
    BranchBuild.check_local_backend();
    await BranchBuild.check_run({ compiles: [] });
  });


  test('B1, B3, B4: --branch with the local OBI 6; refused without a local OBI or with an older one', () => {
    on();
    sinon.stub(BranchBuild, 'current_branch').returns('PROJ-337-order');
    assert.deepStrictEqual(BranchBuild.args(), ['--branch=PROJ-337-order']);

    const without = sinon.stub(OBITools, 'without_local_obi').returns(true);
    assert.throws(() => BranchBuild.check_local_backend(), (e: unknown) => e instanceof BranchBuildRefusal && /need the local OBI/.test(e.message));
    without.restore();

    local_obi_version(5);
    assert.throws(() => BranchBuild.check_local_backend(), /too old for branch builds/);
    fs.writeFileSync(path.join(local_obi, 'module', 'obi_constants.py'), 'OBI_BACKEND_VERSION = 6\n');
    BranchBuild.check_local_backend();
  });


  test('B4: Preview build without a local OBI is refused before the fallback builds a list', async () => {
    on();
    sinon.stub(OBITools, 'without_local_obi').returns(true);
    sinon.stub(OBITools, 'self_check');
    const config = AppConfig.get_app_config();
    sinon.stub(AppConfig, 'get_app_config').returns({ ...config, attributes_missing: () => false } as unknown as AppConfig);
    const fallback = sinon.stub(OBITools, 'generate_source_change_lists').resolves([]);
    const error = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);

    assert.strictEqual(await OBICommands['do_show_changes']({} as vscode.ExtensionContext), false);
    assert.ok(fallback.notCalled);
    assert.match(String(error.firstCall.args[0]), /need the local OBI/);
  });


  test('B7, B5: a list of another branch, a list without branch build, an old OBI on IBM i', async () => {
    on();
    const branch = sinon.stub(BranchBuild, 'current_branch').returns('PROJ-337-order');
    sinon.stub(SSH_Tasks, 'get_remote_obi_dir').resolves('/apps/obi');
    const remote = sinon.stub(SSH_Tasks, 'run_command').resolves({ code: 0, stdout: 'OBI_BACKEND_VERSION = 6\n', stderr: '' });

    await BranchBuild.check_run(BRANCH_LIST);
    assert.match(String(remote.firstCall.args[0]), /'\/apps\/obi\/module\/obi_constants\.py'/);

    branch.returns('main');
    await assert.rejects(() => BranchBuild.check_run(BRANCH_LIST), (e: unknown) => e instanceof BranchBuildRefusal && e.new_build_list && /created on branch PROJ-337-order/.test(e.message));
    await assert.rejects(() => BranchBuild.check_run({ compiles: [] }), /created without branch build/);

    branch.returns('PROJ-337-order');
    const update = sinon.stub(BackendUpdate, 'update_remote_strict').resolves();
    assert.ok(update.notCalled, 'version 6: no update');

    // B5: an old OBI on IBM i is updated first, also without obi.backend.autoUpdateRemote
    remote.resolves({ code: 0, stdout: 'OBI_BACKEND_VERSION = 5\n', stderr: '' });
    update.callsFake(async () => { remote.resolves({ code: 0, stdout: 'OBI_BACKEND_VERSION = 6\n', stderr: '' }); });
    await BranchBuild.check_run(BRANCH_LIST);
    assert.ok(update.calledOnce);

    // The update fails (e.g. no connection to the git remote): the build is refused with the reason
    remote.resolves({ code: 0, stdout: 'OBI_BACKEND_VERSION = 5\n', stderr: '' });
    update.rejects(new Error('Could not resolve host: github.com'));
    await assert.rejects(() => BranchBuild.check_run(BRANCH_LIST), (e: unknown) => e instanceof BranchBuildRefusal && /too old for branch builds \(version 5, needed: 6\) and could not be updated: Could not resolve host/.test(e.message));

    // Updated, but still too old (e.g. another branch checked out on IBM i)
    update.resolves();
    await assert.rejects(() => BranchBuild.check_run(BRANCH_LIST), /Update the OBI on IBM i \(\/apps\/obi\)/);
  });


  test('deployment guard: main-branch alone (feature off), and all rules with the feature', () => {
    const on_main = sinon.stub(GitChanges, 'commit_on_remote_branch').returns(true);
    const main_list = { compiles: [], package: { name: 'PROJ-337' }, git: { branch: 'main', commit: 'abcdef12' } };

    assert.strictEqual(BranchBuild.deployment_refusal({ compiles: [] }, ''), undefined, 'off and no main-branch: as today');
    assert.strictEqual(BranchBuild.deployment_refusal(main_list, 'main'), undefined);
    assert.match(BranchBuild.deployment_refusal({ ...main_list, git: { branch: 'PROJ-337-order', commit: 'abcdef12' } }, 'main') ?? '', /on main, after the merge\. Branch: PROJ-337-order\./);
    on_main.returns(false);
    assert.match(BranchBuild.deployment_refusal(main_list, 'main') ?? '', /Commit abcdef12 is not on origin\/main/);

    on();
    on_main.returns(true);
    const message = BranchBuild.deployment_refusal({ ...main_list, package: undefined }, 'main') ?? '';
    assert.match(message, /created without branch build/);
    assert.match(message, /not a build package build/);
    assert.strictEqual(BranchBuild.deployment_refusal({ ...main_list, build_context: { mode: 'main', branch: 'main', libs: [] } }, 'main'), undefined);
  });


  test('git of a list is the one of its creation: later writes keep it', () => {
    const file = path.join(ws(), 'list.json');
    const list: Record<string, unknown> = { compiles: [], git: { branch: 'PROJ-337-order', commit: 'abc1234' } };
    OBITools.write_compile_list(file, list);
    assert.deepStrictEqual(DirTool.read_json_strict<Record<string, unknown>>(file)?.['git'], { branch: 'PROJ-337-order', commit: 'abc1234' });
  });


  test('C4: the build summary shows ticket, libraries with ADDLIBLE, and a list of another branch', () => {
    on();
    sinon.stub(AppConfig, 'attributes_missing').returns(false);
    sinon.stub(BuildSummary, 'get_compile_list').returns({ ...BRANCH_LIST, timestamp: '2026-11-26T10:00:00Z', build_context: { ...BRANCH_LIST.build_context, warning: undefined } });
    const branch = sinon.stub(BranchBuild, 'current_branch').returns('PROJ-337-order');
    BuildSummary['_current_compile_output_folder'] = undefined;
    const render = (): string => BuildSummary['generate_html'](vscode.Uri.file(Constants.EXTENSION_ROOT), fake_webview);

    let html = render();
    assert.match(html, /id="branch_build" data-mode="branch"/);
    assert.match(html, /Branch build of ticket 337 \(branch PROJ-337-order\)/);
    assert.match(html, /<code>ADDLIBLE LIB\(#PZ_337\) POSITION\(\*FIRST\)<\/code><button type="button" class="icon-btn cmd-copy" data-cmd="ADDLIBLE LIB\(#PZ_337\) POSITION\(\*FIRST\)"/);
    assert.ok(!html.includes('created on branch'));

    branch.returns('main');
    html = render();
    assert.match(html, /created on branch PROJ-337-order/);
  });


  test('P1, P4: before a package build, sources changed on the branch but missing from the package', async () => {
    const pkg = { name: 'PROJ-337-order', sources: ['lib/q/a.pgm'] } as unknown as BuildPackage;
    const updated = { name: 'PROJ-337-order', sources: ['lib/q/a.pgm', 'lib/q/b.pgm'] } as unknown as BuildPackage;
    const added: string[][] = [];
    let missing = ['lib/q/b.pgm'];
    const commands = { changed_not_in_package: () => missing, add: (_name: string, sources: string[]) => { added.push(sources); }, store: () => ({ get: () => updated }) };
    const check = (p: BuildPackage) => (BuildPackageCommands.prototype as unknown as Record<string, (p: BuildPackage) => Promise<BuildPackage | undefined>>)['check_branch_changes'].call(commands, p);
    const warning = sinon.stub(vscode.window, 'showWarningMessage');

    assert.strictEqual(await check(pkg), pkg, 'feature off: no check');
    on();
    sinon.stub(ExtensionSettings, 'build_packages_base_branch').returns('main');
    const branch = sinon.stub(BranchBuild, 'current_branch').returns('PROJ-337-order');

    warning.resolves('Add and build' as unknown as vscode.MessageItem);
    assert.strictEqual(await check(pkg), updated);
    assert.deepStrictEqual(added, [['lib/q/b.pgm']]);
    assert.match(String(warning.firstCall.args[0]), /1 source\(s\) changed on this branch \(since main\) are not in build package PROJ-337-order/);
    assert.strictEqual((warning.firstCall.args[1] as vscode.MessageOptions).detail, 'lib/q/b.pgm');

    warning.resolves('Build anyway' as unknown as vscode.MessageItem);
    assert.strictEqual(await check(pkg), pkg);
    warning.resolves(undefined);
    assert.strictEqual(await check(pkg), undefined, 'cancelled');

    missing = [];
    warning.resetHistory();
    assert.strictEqual(await check(pkg), pkg);
    branch.returns('main');
    missing = ['lib/q/b.pgm'];
    assert.strictEqual(await check(pkg), pkg, 'on the base branch: nothing to compare');
    assert.ok(warning.notCalled);
  });


  test('P3: after a branch build without a package, a package with the branch name is offered once', () => {
    const state = new Map<string, unknown>();
    const original = OBITools.ext_context;
    OBITools.ext_context = { workspaceState: { get: (key: string) => state.get(key), update: async (key: string, value: unknown) => { state.set(key, value); } } } as unknown as vscode.ExtensionContext;
    const names = sinon.stub(BuildPackageStore.prototype, 'names').returns(['other']);
    const info = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const offer = (branch: string) => (OBICommands as unknown as Record<string, (branch: string) => void>)['offer_branch_package'](branch);
    try {
      offer('PROJ-337-order');
      offer('PROJ-337-order');
      assert.strictEqual(info.callCount, 1, 'once per branch');
      assert.match(String(info.firstCall.args[0]), /Branch PROJ-337-order has no build package yet/);

      names.returns(['proj-338-x']);
      offer('PROJ-338-x');
      assert.strictEqual(info.callCount, 1, 'a package with the name exists (case doesn\'t matter)');
    }
    finally {
      OBITools.ext_context = original;
    }
  });


  test('4.6: Branch libraries lists by ticket, preselects merged and orphaned ones, deletes after the confirmation', async () => {
    on();
    sinon.stub(SSH_Tasks, 'get_remote_base_dir').resolves('/home/max/proj');
    sinon.stub(SSH_Tasks, 'get_remote_obi_dir').resolves('/apps/obi');
    const libs = [
      { name: '#AA_1', ticket: '1', env: 'AA', text: 'OBI PROJ-1-merged', last_used: '2026-11-20' },
      { name: '#BB_1', ticket: '1', env: 'BB', text: 'OBI PROJ-1-merged', last_used: '2026-11-21' },
      { name: '#AA_2', ticket: '2', env: 'AA', text: 'OBI PROJ-2-active', last_used: null },
      { name: '#AA_3', ticket: '3', env: 'AA', text: 'OBI PROJ-3-deleted-branch', last_used: null },
    ];
    const run = sinon.stub(SSH_Tasks, 'run_command').callsFake(async (cmd: string) => {
      if (cmd.startsWith('cat '))
        return { code: 0, stdout: 'OBI_BACKEND_VERSION = 6\n', stderr: '' };
      if (cmd.includes("'--list'"))
        return { code: 0, stdout: `INFO log line\n${JSON.stringify({ version: 6, status: 'ok', libs })}\n`, stderr: '' };
      return { code: 0, stdout: JSON.stringify({ version: 6, status: 'ok', deleted: ['#AA_1', '#BB_1'], failed: [{ name: '#AA_3', message: 'CPF2125 in use' }] }), stderr: '' };
    });
    sinon.stub(GitChanges, 'list_branches').returns({ local: ['main', 'PROJ-1-merged', 'PROJ-2-active'], remote: ['origin/main', 'origin/PROJ-1-merged', 'origin/PROJ-2-active'], gone: [] });
    sinon.stub(GitChanges, 'is_merged_into').callsFake((_cwd: string, branch: string) => branch === 'PROJ-1-merged');
    let items: (vscode.QuickPickItem & { picked?: boolean })[] = [];
    sinon.stub(vscode.window, 'showQuickPick').callsFake(async (offered: unknown) => {
      items = await (offered as Promise<vscode.QuickPickItem[]>);
      return items.filter(item => item.picked) as unknown as vscode.QuickPickItem;
    });
    const warning = sinon.stub(vscode.window, 'showWarningMessage').resolves('Delete' as unknown as vscode.MessageItem);
    const error = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    const info = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    sinon.stub(BuildPackageStore.prototype, 'names').returns(['PROJ-1-merged']);
    sinon.stub(BuildPackageStore.prototype, 'get').returns({ name: 'PROJ-1-merged', sources: [] } as unknown as BuildPackage);

    await manage_branch_libraries('main');

    assert.deepStrictEqual(items.map(item => [item.label, item.description, !!item.picked]), [
      ['PROJ-1-merged', 'merged', true], ['PROJ-2-active', 'active', false], ['Ticket 3', 'no branch', true]]);
    assert.strictEqual(items[0].detail, '#AA_1, #BB_1 · last used 2026-11-21');
    assert.match(String((warning.firstCall.args[1] as vscode.MessageOptions).detail), /^#AA_1, #BB_1, #AA_3/);
    assert.match(String(run.lastCall.args[0]), /cd '\/home\/max\/proj' \|\| exit 1; '\/apps\/obi\/venv\/bin\/python' -X utf8 '\/apps\/obi\/main\.py' -a branch_libs -p \. '--delete=#AA_1,#BB_1,#AA_3'$/);
    assert.match(String(error.firstCall.args[0]), /2 branch libraries deleted, 1 not: #AA_3 \(CPF2125 in use\)/);
    // Ticket 1 is gone completely: its package is offered for archiving; ticket 3 isn't (one library left)
    assert.ok(info.getCalls().some(call => /Archive the build packages of these tickets\? PROJ-1-merged$/.test(String(call.args[0]))));
  });


  test('4.6: without the feature, or with an old OBI on IBM i, nothing is listed', async () => {
    const info = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const run = sinon.stub(SSH_Tasks, 'run_command').resolves({ code: 0, stdout: 'OBI_BACKEND_VERSION = 5\n', stderr: '' });
    await manage_branch_libraries('main');
    assert.match(String(info.firstCall.args[0]), /not configured/);
    assert.ok(run.notCalled);

    on();
    sinon.stub(SSH_Tasks, 'get_remote_obi_dir').resolves('/apps/obi');
    const update = sinon.stub(BackendUpdate, 'update_remote_strict').resolves();
    const error = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    await manage_branch_libraries('main');
    assert.ok(update.calledOnce, 'an old OBI on IBM i is updated first');
    assert.match(String(error.firstCall.args[0]), /Version found: 5, needed: 6/);
    assert.strictEqual(run.callCount, 2, 'only the version was read, before and after the update');
  });


  test('C6: a branch build in the build history shows its ticket and libraries', () => {
    const dir = '2026-11-26T10.00.00.000Z';
    const dir_path = path.join(ws(), Constants.BUILD_HISTORY_DIR, dir);
    fs.mkdirSync(dir_path, { recursive: true });
    fs.writeFileSync(path.join(dir_path, 'compile-list.json'), JSON.stringify({ ...BRANCH_LIST, package: { name: 'PROJ-337-order' } }));
    const item = (BuildHistoryProvider as unknown as Record<string, (dir: string, dir_path: string, date: Date) => vscode.TreeItem>)['build_item'](dir, dir_path, new Date('2026-11-26T10:00:00Z'));
    assert.strictEqual(item.description, '#337 · PROJ-337-order');
    assert.match(String(item.tooltip), /Branch build of ticket 337: #PZ_337/);

    fs.writeFileSync(path.join(dir_path, 'compile-list.json'), JSON.stringify({ compiles: [], build_context: { mode: 'main', branch: 'main', libs: [] } }));
    const main = (BuildHistoryProvider as unknown as Record<string, (dir: string, dir_path: string, date: Date) => vscode.TreeItem>)['build_item'](dir, dir_path, new Date('2026-11-26T10:00:00Z'));
    assert.strictEqual(main.description, undefined);
    assert.match(String(main.tooltip), /Main libraries/);
  });


  test('U1, U2: the Branch build fields of the project tab are saved into app-config.toml', () => {
    sinon.stub(ProjectState, 'update').resolves();
    sinon.stub(OBITools, 'check_local_obi');
    sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const warning = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    const section = () => DirTool.read_toml_strict<Record<string, Record<string, unknown>>>(project_file())?.['branch-build'];
    const save = (form: Record<string, unknown>) => OBIConfiguration.save_config(false, Workspace.get_workspace_uri(), { 'branch-build': form });

    // Only the checkbox (always sent): no section is created
    save({ enabled: true });
    assert.strictEqual(section(), undefined);

    save({ enabled: true, 'ticket-pattern': '(?i)\\bproj[-_](\\d+)', 'lib-name': '#$(ENV)_$(TICKET)', env: { aaobj: 'AA', aadta: 'AA' }, 'no-lib-steps': ['global.cmds.skip'] });
    let saved = section();
    assert.strictEqual(saved?.['ticket-pattern'], '(?i)\\bproj[-_](\\d+)', 'the backslashes stay');
    assert.deepStrictEqual({ ...saved?.['env'] as object }, { aaobj: 'AA', aadta: 'AA' });
    assert.strictEqual(saved?.['enabled'], undefined, 'true is the default');
    assert.ok(warning.notCalled);
    assert.strictEqual(BranchBuild.is_active(), true);

    // Off, a cleared field, and a key the page doesn't edit
    fs.appendFileSync(project_file(), '\n[branch-build.settings]\nINCLUDE_BNDDIR = "X"\n');
    save({ enabled: false, 'ticket-pattern': '(?i)\\bproj[-_](\\d+)', 'lib-name': '#$(ENV)_$(TICKET)', env: { aaobj: 'AA' } });
    saved = section();
    assert.strictEqual(saved?.['enabled'], false);
    assert.strictEqual(saved?.['no-lib-steps'], undefined, 'cleared');
    assert.deepStrictEqual({ ...saved?.['settings'] as object }, { INCLUDE_BNDDIR: 'X' });
    assert.strictEqual(BranchBuild.is_active(), false);

    save({ 'ticket-pattern': 'no group', 'lib-name': '#X' });
    assert.match(String(warning.firstCall.args[0]), /needs a group/);
  });


  test('U1: the page shows the section only in the project tab, with the values of app-config.toml', async () => {
    on();
    const context = { secrets: { get: async () => undefined }, workspaceState: { get: () => undefined } } as unknown as vscode.ExtensionContext;
    const html: string = await OBIConfiguration['generate_html'](context, vscode.Uri.file(Constants.EXTENSION_ROOT), fake_webview);
    // The backslash as &#92;: the browser shows it as \\
    assert.match(html, /id="project\|branch-build\|ticket-pattern" type="text" value="\(\?i\)&#92;bproj\[-_\]\(&#92;d\+\)"/);
    assert.match(html, /<textarea [^>]*id="project\|branch-build\|env"[^>]*>prouzalib = PZ<\/textarea>/);
    assert.ok(!html.includes('user|branch-build|'), 'not in the user tab');
  });
});
