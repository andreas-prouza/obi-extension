import assert from 'assert';
import * as path from 'path';
import * as fse from 'fs-extra';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Workspace } from '../../extension/utilities/Workspace';
import { AppConfig } from '../../extension/config/AppConfig';
import { DirTool } from '../../extension/utilities/DirTool';
import { DependencyList } from '../../extension/obi/Dependency';
import { OBITools } from '../../extension/utilities/OBITools';
import { BuildPackageStore } from '../../extension/obi/BuildPackageStore';
import { package_scope } from '../../extension/obi/compile_list/BuildScope';
import { Constants } from '../../shared/Constants';
import { BuildPackageItem, BuildPackageSourceItem, BuildPackagesDragAndDrop, BuildPackagesProvider } from '../../webview/build_packages/BuildPackagesProvider';
import { SOURCES_MIME_TYPE } from '../../shared/BuildPackage';
import { SourceListProvider } from '../../webview/source_list/SourceListProvider';
import { reset_workspace } from './workspace_fixture';
import { OBICommands } from '../../extension/obi/OBICommands';
import { PackageLastBuilds } from '../../extension/obi/PackageLastBuilds';


const GOLDEN = path.resolve(__dirname, '../../../test-resources/golden/compile-list-package.json');

const CUST = 'prouzalib/qddssrc/cust.pf.file';
const SRV = 'prouzalib/qrpglesrc/srv.sqlrpgle.srvpgm';
const HELLO = 'prouzalib/qrpglesrc/hello.rpgle.pgm';
const TEST4 = 'prouzalib/qrpglesrc/test4.rpgle.pgm';
const OTHER = 'prouzalib/qrpglesrc/other.rpgle.pgm';

const SOURCES: Record<string, string> = {
  [CUST]: '     A          R CUSTR',
  [SRV]: '**free\nctl-opt nomain;',
  [TEST4]: '**free\ndsply \'test4\';',
  [OTHER]: '**free\ndsply \'other\';',
};


/** Compile list without the values that change on every run */
function stable(compile_list: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...compile_list };
  delete rest.timestamp;
  delete rest.git;
  return rest;
}


suite('Build packages', () => {

  const ws = () => Workspace.get_workspace();
  const store = () => new BuildPackageStore(ws());
  const compile_list_file = () => path.join(ws(), AppConfig.get_app_config().general['compile-list']);

  setup(async () => {
    await reset_workspace();
    for (const [source, content] of Object.entries(SOURCES))
      await fse.outputFile(path.join(ws(), 'src', source), content);
    DirTool.write_json(path.join(ws(), Constants.DEPENDENCY_LIST), { [HELLO]: [SRV], [SRV]: [CUST] });
    AppConfig.reset();
    await DependencyList.load_dependencies();

    // Everything is built: a package builds its sources anyway
    DirTool.write_json(path.join(ws(), AppConfig.get_app_config().general['compiled-object-list']), await OBITools.retrieve_current_source_hashes(false));
  });

  teardown(async () => {
    sinon.restore();
    await fse.copy(path.resolve(__dirname, '../../../test-resources/appconfig/.obi/etc'), path.join(ws(), '.obi/etc'));
    AppConfig.reset();
    await DependencyList.load_dependencies();
  });


  test('the build list contains all package sources (also unchanged ones), their dependents and the package', async () => {
    store().create('ABC-123', 'Order', [TEST4, CUST]);

    const sources = await OBITools.generate_source_change_lists(package_scope(store().get('ABC-123')));

    assert.deepStrictEqual(sources, [CUST, TEST4, SRV, HELLO]);
    assert.deepStrictEqual(DirTool.read_json_strict(path.join(ws(), Constants.CHANGED_OBJECT_LIST)), { 'new-objects': [], 'changed-sources': [CUST, TEST4], 'old-sources': [] });
    assert.deepStrictEqual(DirTool.read_json_strict(path.join(ws(), Constants.DEPENDEND_OBJECT_LIST)), [SRV, HELLO]);

    const compile_list = stable(DirTool.read_json_strict<Record<string, unknown>>(compile_list_file()) ?? {});
    assert.deepStrictEqual(compile_list.package, { name: 'ABC-123', description: 'Order' });
    assert.ok(!JSON.stringify(compile_list).includes(OTHER), 'other sources are not built');

    if (process.env.OBI_UPDATE_GOLDEN) {
      await fse.outputFile(GOLDEN, JSON.stringify(compile_list, null, 2) + '\n');
      return;
    }
    assert.deepStrictEqual(compile_list, JSON.parse(await fse.readFile(GOLDEN, 'utf8')));
  });


  test('a package with a missing source creates no build list and offers to remove it', async () => {
    store().create('ABC-123', undefined, [TEST4, 'prouzalib/qrpglesrc/gone.rpgle.pgm']);
    await fse.remove(compile_list_file());
    const error = sinon.stub(vscode.window, 'showErrorMessage').callsFake(async () => 'Remove from package' as unknown as vscode.MessageItem);

    await vscode.commands.executeCommand('obi.build-package.show-build-list', new BuildPackageItem({ name: 'ABC-123', pkg: store().get('ABC-123') }));

    assert.match(String(error.firstCall.args[0]), /gone\.rpgle\.pgm/);
    assert.ok(!(await fse.pathExists(compile_list_file())), 'no build list');
    assert.deepStrictEqual(store().get('ABC-123').sources, [TEST4]);
  });


  test('renaming a source renames it in the packages', async () => {
    store().create('ABC-123', undefined, [TEST4, CUST]);
    store().create('other', undefined, [CUST]);
    const before = await fse.readFile(store().file('other'), 'utf8');

    await SourceListProvider.sync_renamed_source_member(TEST4, 'prouzalib/qrpglesrc/test5.rpgle.pgm');

    assert.deepStrictEqual(store().get('ABC-123').sources, [CUST, 'prouzalib/qrpglesrc/test5.rpgle.pgm']);
    assert.strictEqual(await fse.readFile(store().file('other'), 'utf8'), before, 'packages without the source are not written');
  });


  test('add to build package from the explorer: unsupported files are left out', async () => {
    store().create('ABC-123');
    const uri = (file: string) => vscode.Uri.file(path.join(ws(), file));
    await fse.outputFile(path.join(ws(), 'src/prouzalib/qrpglesrc/notes.txt'), 'x');
    sinon.stub(vscode.window, 'showQuickPick').callsFake(async (items: unknown) =>
      (await items as { name: string }[]).find(item => item.name === 'ABC-123') as unknown as vscode.QuickPickItem);
    const warning = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);

    const files = [uri(`src/${TEST4}`), uri(`src/${CUST}`), uri('src/prouzalib/qrpglesrc/notes.txt')];
    await vscode.commands.executeCommand('obi.build-package.add-to-package', files[0], files);

    assert.deepStrictEqual(store().get('ABC-123').sources, [CUST, TEST4]);
    assert.match(String(warning.firstCall.args[0]), /notes\.txt/);
  });


  test('view: packages with their sources; missing sources and invalid files are marked', async () => {
    store().create('ABC-123', 'Order', [TEST4, 'prouzalib/qrpglesrc/gone.rpgle.pgm']);
    await fse.outputFile(path.join(ws(), Constants.BUILD_PACKAGE_DIR, 'broken.json'), '{');
    // The tests use the unbundled modules, the running extension its bundle: an own provider
    const provider = new BuildPackagesProvider(ws());

    const packages = await provider.getChildren() as BuildPackageItem[];
    assert.deepStrictEqual(packages.map(item => [item.name, item.contextValue]), [['ABC-123', 'obi-build-package'], ['broken', 'obi-build-package-invalid']]);
    assert.match(String(packages[0].description), /^Order · 2 /);

    const sources = await provider.getChildren(packages[0]) as BuildPackageSourceItem[];
    assert.deepStrictEqual(sources.map(item => item.source), ['prouzalib/qrpglesrc/gone.rpgle.pgm', TEST4]);
    assert.ok(sources[0].iconPath instanceof vscode.ThemeIcon && sources[0].iconPath.id === 'warning', 'missing source');
    assert.ok(sources[1].resourceUri && sources[1].command, 'existing source opens');
    assert.deepStrictEqual(await provider.getChildren(packages[1]), []);
  });


  test('view: archived packages are hidden unless shown; the text filter matches name, description and sources', async () => {
    store().create('ABC-123', 'Order', [TEST4]);
    store().create('old', undefined, [TEST4]);
    store().set_archived('old', true);
    store().create('xyz', undefined, [CUST]);
    const provider = new BuildPackagesProvider(ws());
    const names = async () => (await provider.getChildren() as BuildPackageItem[]).map(item => item.name);

    assert.deepStrictEqual(await names(), ['ABC-123', 'xyz']);
    provider.set_show_archived(true);
    assert.deepStrictEqual(await names(), ['ABC-123', 'old', 'xyz']);
    const old = (await provider.getChildren() as BuildPackageItem[])[1];
    assert.strictEqual(old.contextValue, 'obi-build-package-archived');
    assert.match(String(old.description), /^archived · /);

    provider.set_filter('ORDER');
    assert.deepStrictEqual(await names(), ['ABC-123']);
    provider.set_filter('cust.pf');
    assert.deepStrictEqual(await names(), ['xyz']);
    provider.set_filter('');
    provider.set_show_archived(false);
    assert.deepStrictEqual(await names(), ['ABC-123', 'xyz']);
  });


  test('drag and drop: sources of the Source filters, files of the Explorer, onto a package or one of its sources', async () => {
    store().create('ABC-123', undefined, [TEST4]);
    const provider = new BuildPackagesProvider(ws());
    const dnd = new BuildPackagesDragAndDrop(provider);
    const info = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    const target = () => new BuildPackageItem({ name: 'ABC-123', pkg: store().get('ABC-123') });
    const transfer = (mime: string, value: string) => {
      const data = new vscode.DataTransfer();
      data.set(mime, new vscode.DataTransferItem(value));
      return data;
    };

    await dnd.handleDrop(target(), transfer(SOURCES_MIME_TYPE, JSON.stringify([CUST, '../etc/passwd'])));
    assert.deepStrictEqual(store().get('ABC-123').sources, [CUST, TEST4]);

    await fse.outputFile(path.join(ws(), 'src/prouzalib/qrpglesrc/notes.txt'), 'x');
    const uris = [`src/${OTHER}`, 'src/prouzalib/qrpglesrc/notes.txt', 'README.md'].map(file => vscode.Uri.file(path.join(ws(), file)).toString());
    const source_item = new BuildPackageSourceItem('ABC-123', TEST4, undefined, true);
    await dnd.handleDrop(source_item, transfer('text/uri-list', uris.join('\r\n')));
    assert.deepStrictEqual(store().get('ABC-123').sources, [CUST, OTHER, TEST4]);

    info.resetHistory();
    await dnd.handleDrop(undefined, transfer(SOURCES_MIME_TYPE, JSON.stringify([SRV])));
    assert.match(String(info.firstCall.args[0]), /Drop the sources on a build package/);
    assert.ok(!store().get('ABC-123').sources.includes(SRV));

    const dragged = new vscode.DataTransfer();
    dnd.handleDrag([source_item, target()], dragged);
    assert.deepStrictEqual(JSON.parse(await dragged.get(SOURCES_MIME_TYPE)!.asString()), [TEST4]);
  });


  test('last build: stored with the build history, shown on the package with a link to its build summary', async () => {
    store().create('ABC-123', undefined, [TEST4]);
    store().create('never', undefined, [TEST4]);
    const compile_list = {
      timestamp: '2026-11-19T10:31:00.000Z', package: { name: 'ABC-123' },
      compiles: [{ level: 1, sources: [{ source: TEST4, cmds: [{ cmd: 'x', status: 'failed' }] }] }]
    };
    const history = OBICommands.write_build_history(ws(), compile_list, AppConfig.get_app_config());

    const last = new PackageLastBuilds(ws()).get('ABC-123');
    assert.deepStrictEqual(last && { status: last.status, history: last.history, total: last.total, failed: last.failed }, { status: 'failed', history, total: 1, failed: 1 });

    const items = await new BuildPackagesProvider(ws()).getChildren() as BuildPackageItem[];
    const built = items.find(item => item.name === 'ABC-123')!;
    assert.match(String(built.description), / · ✗ /);
    assert.ok(built.iconPath instanceof vscode.ThemeIcon);
    assert.deepStrictEqual(built.iconPath.color, new vscode.ThemeColor('testing.iconFailed'));
    const tooltip = built.tooltip as vscode.MarkdownString;
    assert.match(tooltip.value.replace(/&nbsp;/g, ' '), /1 of 1 sources failed/);
    assert.ok(tooltip.value.includes(`command:obi.build-package.open-last-build?${encodeURIComponent(JSON.stringify(['ABC-123']))}`));
    const never = items.find(item => item.name === 'never')!;
    assert.ok(!String(never.description).includes('✗') && !(never.tooltip as vscode.MarkdownString).value.includes('command:'));

    // Not built here yet, and a build no longer in the build history
    const info = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    await vscode.commands.executeCommand('obi.build-package.open-last-build', 'never');
    assert.match(String(info.lastCall.args[0]), /wasn't built on this computer yet/);
    await fse.remove(path.join(ws(), Constants.BUILD_HISTORY_DIR, history));
    await vscode.commands.executeCommand('obi.build-package.open-last-build', 'ABC-123');
    assert.match(String(info.lastCall.args[0]), /no longer in the build history/);
  });


  test('add the sources of a build: all offered, those unchecked in the build list unchecked', async () => {
    store().create('ABC-123', undefined, [TEST4]);
    const history = path.join(ws(), Constants.BUILD_HISTORY_DIR, '2026-11-20T08.00.00.000Z');
    DirTool.write_json(path.join(history, 'compile-list.json'), { compiles: [
      { level: 1, sources: [{ source: CUST, cmds: [] }, { source: TEST4, cmds: [] }, { source: OTHER, cmds: [], ignore: true }] },
      { level: 2, sources: [{ source: SRV, cmds: [] }] },
    ] });
    sinon.stub(vscode.window, 'showQuickPick').callsFake(async (items: unknown) =>
      (await items as { name: string }[]).find(item => item.name === 'ABC-123') as unknown as vscode.QuickPickItem);
    sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);

    // The source QuickPick: accepts what is preselected
    let offered: string[] = [];
    let preselected: string[] = [];
    sinon.stub(vscode.window, 'createQuickPick').callsFake(() => {
      const handlers: { accept?: () => void; hide?: () => void } = {};
      const pick = {
        items: [] as vscode.QuickPickItem[], selectedItems: [] as vscode.QuickPickItem[],
        onDidAccept: (handler: () => void) => { handlers.accept = handler; },
        onDidHide: (handler: () => void) => { handlers.hide = handler; },
        show: () => {
          offered = pick.items.map(item => item.label);
          preselected = pick.selectedItems.map(item => item.label);
          setTimeout(() => handlers.accept?.(), 0);
        },
        hide: () => handlers.hide?.(), dispose: () => undefined,
      };
      return pick as unknown as vscode.QuickPick<vscode.QuickPickItem>;
    });

    await vscode.commands.executeCommand('obi.build-package.add-build-sources', { contextValue: 'buildHistoryBuild', file_path: history });

    assert.deepStrictEqual(offered, [CUST, TEST4, OTHER, SRV]);
    assert.deepStrictEqual(preselected, [CUST, TEST4, SRV], 'unchecked in the build list: unchecked');
    assert.deepStrictEqual(store().get('ABC-123').sources, [CUST, TEST4, SRV].sort());

    // A path outside the workspace (e.g. from a page) is refused
    const error = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    await vscode.commands.executeCommand('obi.build-package.add-build-sources', '/etc/compile-list.json');
    assert.match(String(error.firstCall.args[0]), /action failed/);
  });
});

