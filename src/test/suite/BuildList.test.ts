import assert from 'assert';
import * as path from 'path';
import * as fse from 'fs-extra';
import { Workspace } from '../../extension/utilities/Workspace';
import { AppConfig } from '../../extension/config/AppConfig';
import { DirTool } from '../../extension/utilities/DirTool';
import { createBuildList } from '../../extension/obi/compile_list/createBuildList';
import { find_unresolved_placeholders } from '../../extension/obi/compile_list/modules/cmd_parameters';
import { OBITools } from '../../extension/utilities/OBITools';
import { Constants } from '../../shared/Constants';
import { DependencyList } from '../../extension/obi/Dependency';
import { reset_workspace } from './workspace_fixture';
import { getSteps } from '../../extension/obi/compile_list/modules/app_config_tools';


suite('Build list generation', () => {

  setup(async () => {
    await reset_workspace();
    AppConfig.reset();
  });


  test('fixture project: commands are generated and fully resolved', async () => {
    await createBuildList();

    const compile_list = DirTool.read_json_strict<{ compiles: { sources: { source: string; cmds: { cmd: string }[] }[] }[] }>(
      path.join(Workspace.get_workspace(), AppConfig.get_app_config().general['compile-list']));
    assert.ok(compile_list, 'compile-list written');

    const cmds = compile_list.compiles.flatMap(level => level.sources.flatMap(source => source.cmds.map(cmd => cmd.cmd)));
    if (process.env.OBI_TEST_PRINT_CMDS)
      console.log(cmds.join('\n'));

    assert.ok(cmds.length > 0, 'at least one command');
    for (const cmd of cmds)
      assert.deepStrictEqual(find_unresolved_placeholders(cmd), [], cmd);
  });
});


suite('Changed sources are detected with one hash run', () => {

  const ws = () => Workspace.get_workspace();

  teardown(async () => {
    await fse.copy(path.resolve(__dirname, '../../../test-resources/appconfig/.obi/etc/dependency.json'), path.join(ws(), Constants.DEPENDENCY_LIST));
    await DependencyList.load_dependencies();
  });
  const object_builds = () => path.join(ws(), AppConfig.get_app_config().general['compiled-object-list']);

  setup(async () => {
    await reset_workspace();
    AppConfig.reset();
  });


  test('an empty source that was built is not changed (bugs.md #15); a changed one is', async () => {
    const empty = path.join(DirTool.get_local_source_dir(), 'prouzalib', 'qrpglesrc', 'empty.rpgle.pgm');
    fse.writeFileSync(empty, '');
    DirTool.write_json(object_builds(), {
      'prouzalib/qrpglesrc/empty.rpgle.pgm': 'd41d8cd98f00b204e9800998ecf8427e',   // as stored by the Python OBI
      'prouzalib/qrpglesrc/hello.rpgle.pgm': 'old-hash'
    });

    const sources = await OBITools.generate_source_change_lists();

    assert.deepStrictEqual(sources, ['prouzalib/qrpglesrc/hello.rpgle.pgm']);
    const changed = DirTool.read_json_strict<{ 'changed-sources': string[] }>(path.join(ws(), Constants.CHANGED_OBJECT_LIST));
    assert.deepStrictEqual(changed?.['changed-sources'], ['prouzalib/qrpglesrc/hello.rpgle.pgm']);
    assert.deepStrictEqual(DirTool.read_json_strict(path.join(ws(), Constants.DEPENDEND_OBJECT_LIST)), []);
    assert.ok(fse.existsSync(path.join(ws(), Constants.SOURCE_HASH_CACHE_FILE)), 'hash cache written');
  });


  test('dependents of a changed source are built and listed once', async () => {
    const qrpglesrc = path.join(DirTool.get_local_source_dir(), 'prouzalib', 'qrpglesrc');
    fse.writeFileSync(path.join(qrpglesrc, 'user.rpgle.pgm'), '**free');
    DirTool.write_json(path.join(ws(), Constants.DEPENDENCY_LIST), { 'prouzalib/qrpglesrc/user.rpgle.pgm': ['prouzalib/qrpglesrc/hello.rpgle.pgm'] });
    await DependencyList.load_dependencies();   // the file watcher does this in the extension
    DirTool.write_json(object_builds(), { 'prouzalib/qrpglesrc/user.rpgle.pgm': 'unchanged-is-irrelevant' });

    const hashes = await OBITools.retrieve_current_source_hashes();
    DirTool.write_json(object_builds(), { 'prouzalib/qrpglesrc/user.rpgle.pgm': hashes['prouzalib/qrpglesrc/user.rpgle.pgm'] });

    const sources = await OBITools.generate_source_change_lists();
    assert.deepStrictEqual(sources, ['prouzalib/qrpglesrc/hello.rpgle.pgm', 'prouzalib/qrpglesrc/user.rpgle.pgm']);
    assert.deepStrictEqual(DirTool.read_json_strict(path.join(ws(), Constants.DEPENDEND_OBJECT_LIST)), ['prouzalib/qrpglesrc/user.rpgle.pgm']);
  });


  test('extended source processing can be switched off (USE_ESP = false), as in the Python OBI', () => {
    const esp = { extended_source_processing: [{ conditions: { SOURCE_FILE_NAMES: ['*.pgm'] }, use_regex: false, steps: [{ step: 'global.cmds.esp-step' }] }] };
    const general = AppConfig.get_app_config().general;
    const config = (use_esp?: boolean) => ({ general, global: { settings: { general: use_esp === undefined ? {} : { USE_ESP: use_esp } }, steps: { 'rpgle.pgm': ['global.cmds.normal'] } } });
    const source = 'prouzalib/qrpglesrc/hello.rpgle.pgm';

    assert.deepStrictEqual(getSteps(source, config(), esp), [{ step: 'global.cmds.esp-step' }], 'on by default');
    assert.deepStrictEqual(getSteps(source, config(true), esp), [{ step: 'global.cmds.esp-step' }]);
    assert.deepStrictEqual(getSteps(source, config(false), esp), ['global.cmds.normal']);
  });
});
