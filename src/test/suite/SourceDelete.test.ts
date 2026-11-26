import assert from 'assert';
import * as path from 'path';
import * as fse from 'fs-extra';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Workspace } from '../../extension/utilities/Workspace';
import { AppConfig } from '../../extension/config/AppConfig';
import { DirTool } from '../../extension/utilities/DirTool';
import { DependencyList } from '../../extension/obi/Dependency';
import { BuildPackageStore } from '../../extension/obi/BuildPackageStore';
import { LocalSourceList } from '../../extension/utilities/LocalSourceList';
import { SourceListProvider } from '../../webview/source_list/SourceListProvider';
import { Constants } from '../../shared/Constants';
import { reset_workspace } from './workspace_fixture';


const GONE = 'prouzalib/qrpglesrc/gone.rpgle.pgm';
const USER = 'prouzalib/qrpglesrc/user.rpgle.pgm';
const KEEP = 'prouzalib/qrpglesrc/keep.rpgle.pgm';


/** Delete source member: confirmation, trash, project files (improvements v2.2.3 R4) */
suite('Delete source', () => {

  const ws = () => Workspace.get_workspace();
  const file_of = (source: string) => path.join(ws(), 'src', source);
  const store = () => new BuildPackageStore(ws());
  let deleted: { file: string; trash: boolean | undefined }[];
  let warning: sinon.SinonStub;
  /** Errors of the next fs.delete calls, in order */
  let delete_errors: Error[];

  // The method doesn't use the provider's state; a new provider would replace the one of the running extension
  const delete_source = (source: string) => SourceListProvider.prototype.delete_source_member.call(SourceListProvider.source_list_provider, vscode.Uri.file(file_of(source)));

  setup(async () => {
    await reset_workspace();
    for (const source of [GONE, USER, KEEP])
      await fse.outputFile(file_of(source), '**free');
    await fse.appendFile(path.join(ws(), Constants.OBI_SOURCE_CONFIG_FILE), `\n["${GONE}"]\nsettings = { TGTRLS = "V7R4M0" }\n`);
    DirTool.write_json(path.join(ws(), Constants.DEPENDENCY_LIST), { [GONE]: [KEEP], [USER]: [GONE, KEEP] });
    AppConfig.reset();
    await DependencyList.load_dependencies();
    DirTool.write_json(path.join(ws(), AppConfig.get_app_config().general['compiled-object-list']), { [GONE]: 'h1', [KEEP]: 'h2' });
    DirTool.write_json(path.join(ws(), AppConfig.get_app_config().general['source-infos'] ?? '.obi/etc/source-infos.json'), { [GONE]: { description: 'Gone' }, [KEEP]: { description: 'Keep' } });
    await LocalSourceList.load_source_infos();
    store().create('PKG', undefined, [GONE, KEEP]);
    store().create('other', undefined, [KEEP]);

    deleted = [];
    delete_errors = [];
    // No real trash: the files of the test would end up in the trash of the desktop
    sinon.stub(SourceListProvider, 'delete_file').value(async (uri: vscode.Uri, options: { useTrash: boolean }) => {
      const error = delete_errors.shift();
      if (error)
        throw error;
      deleted.push({ file: uri.fsPath, trash: options.useTrash });
      await fse.remove(uri.fsPath);
    });
    warning = sinon.stub(vscode.window, 'showWarningMessage').resolves('Delete' as unknown as vscode.MessageItem);
  });

  teardown(async () => {
    sinon.restore();
    await fse.copy(path.resolve(__dirname, '../../../test-resources/appconfig/.obi/etc'), path.join(ws(), '.obi/etc'));
    AppConfig.reset();
    await DependencyList.load_dependencies();
    await LocalSourceList.load_source_infos();
  });


  test('after the confirmation: the file goes to the trash, the source leaves all project files', async () => {
    assert.strictEqual(await delete_source(GONE), true);

    const [question, options] = warning.firstCall.args as unknown as [string, vscode.MessageOptions];
    assert.strictEqual(question, `Delete source ${GONE}?`);
    assert.ok(options.modal);
    assert.match(options.detail ?? '', /build packages: PKG\b/);
    assert.match(options.detail ?? '', new RegExp(`These sources use it: ${USER}`));

    assert.deepStrictEqual(deleted, [{ file: file_of(GONE), trash: true }]);
    assert.ok(!(await fse.pathExists(file_of(GONE))));

    AppConfig.reset();
    assert.strictEqual(AppConfig.get_source_configs()?.[GONE], undefined, 'source-config.toml');
    assert.ok(AppConfig.get_source_configs()?.['prouzalib/qrpglesrc/test4.rpgle.pgm'], 'other source settings stay');
    assert.deepStrictEqual(DirTool.read_json_strict(path.join(ws(), Constants.DEPENDENCY_LIST)), { [USER]: [KEEP] }, 'dependency.json');
    assert.deepStrictEqual(DirTool.read_json_strict(path.join(ws(), AppConfig.get_app_config().general['compiled-object-list'])), { [KEEP]: 'h2' }, 'object-builds.json');
    assert.deepStrictEqual(DirTool.read_json_strict(path.join(ws(), AppConfig.get_app_config().general['source-infos'] ?? '.obi/etc/source-infos.json')), { [KEEP]: { description: 'Keep' } }, 'source-infos.json');
    assert.deepStrictEqual(store().get('PKG').sources, [KEEP]);
    assert.deepStrictEqual(store().get('other').sources, [KEEP]);
  });


  test('cancelled: nothing is deleted or changed', async () => {
    warning.resolves(undefined);

    assert.strictEqual(await delete_source(GONE), false);
    assert.deepStrictEqual(deleted, []);
    assert.ok(await fse.pathExists(file_of(GONE)));
    assert.deepStrictEqual(store().get('PKG').sources, [GONE, KEEP]);
    assert.deepStrictEqual(Object.keys(DirTool.read_json_strict(path.join(ws(), Constants.DEPENDENCY_LIST)) ?? {}), [GONE, USER]);
  });


  test('without a trash: deleted permanently only after a second confirmation', async () => {
    delete_errors.push(new Error('trash not supported'));
    warning.onSecondCall().resolves('Delete permanently' as unknown as vscode.MessageItem);

    assert.strictEqual(await delete_source(GONE), true);
    assert.match(String(warning.secondCall.args[0]), /can't be moved to the trash \(trash not supported\)/);
    assert.deepStrictEqual(deleted, [{ file: file_of(GONE), trash: false }]);

    warning.resetHistory();
    delete_errors.push(new Error('trash not supported'));
    warning.onSecondCall().resolves(undefined);
    assert.strictEqual(await delete_source(KEEP), false, 'second question cancelled');
    assert.ok(await fse.pathExists(file_of(KEEP)));
    assert.deepStrictEqual(store().get('other').sources, [KEEP], 'nothing removed');
  });
});
