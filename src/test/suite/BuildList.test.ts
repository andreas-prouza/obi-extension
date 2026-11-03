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
import { getSourceProperties } from '../../extension/obi/compile_list/modules/properties';
import { ExtendedSourceProcessingList } from '../../extension/config/EspConfig';


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
    const esp = { extended_source_processing: [{ conditions: { SOURCE_FILE_NAMES: ['*.pgm'] }, use_regex: false, steps: [{ step: 'global.cmds.esp-step', add_default_steps: false }] }] };
    const general = AppConfig.get_app_config().general;
    const config = (use_esp?: boolean) => ({ general, global: { settings: { general: use_esp === undefined ? {} : { USE_ESP: use_esp } }, steps: { 'rpgle.pgm': ['global.cmds.normal'] } } });
    const source = 'prouzalib/qrpglesrc/hello.rpgle.pgm';

    assert.deepStrictEqual(getSteps(source, config(), esp), [{ step: 'global.cmds.esp-step', add_default_steps: false }], 'on by default');
    assert.deepStrictEqual(getSteps(source, config(true), esp), [{ step: 'global.cmds.esp-step', add_default_steps: false }]);
    assert.deepStrictEqual(getSteps(source, config(false), esp), ['global.cmds.normal']);
  });


  test('a raw cmd step runs once and adds the default steps only on request, as in the OBI backend', () => {
    const general = AppConfig.get_app_config().general;
    const config = { general, global: { settings: { general: {} }, steps: { 'rpgle.pgm': ['global.cmds.normal', 'global.cmds.second'] } } };
    const source = 'prouzalib/qrpglesrc/hello.rpgle.pgm';
    const esp = (step: object) => ({ extended_source_processing: [{ conditions: {}, steps: [step] }] });

    assert.deepStrictEqual(getSteps(source, config, esp({ cmd: 'echo $(OBJ_NAME)' })), [{ cmd: 'echo $(OBJ_NAME)' }]);
    assert.deepStrictEqual(getSteps(source, config, esp({ cmd: 'echo x', step: 'global.cmds.ignored', add_default_steps: true })),
      [{ step: 'global.cmds.ignored', add_default_steps: true, cmd: 'echo x' }, { step: 'global.cmds.normal', add_default_steps: true }, { step: 'global.cmds.second', add_default_steps: true }]);
    assert.deepStrictEqual(getSteps(source, config, esp({ properties: { TARGET_LIB: 'other' } })),
      [{ properties: { TARGET_LIB: 'other' }, step: 'global.cmds.normal' }, { properties: { TARGET_LIB: 'other' }, step: 'global.cmds.second' }], 'neither step nor cmd: the default steps');
  });


  test('ESP files: false stays false, and a raw cmd is kept', () => {
    const list = new ExtendedSourceProcessingList(false, [{ use_regex: true, allow_multiple_matches: false, conditions: {}, steps: [{ cmd: 'echo x' }, { step: 'global.cmds.a', add_default_steps: false }, { step: 'global.cmds.b' }] }]);
    const [block] = list.extended_source_processing;
    assert.strictEqual(block.use_regex, true);
    assert.strictEqual(block.allow_multiple_matches, false);
    assert.deepStrictEqual(block.steps.map(step => [step.cmd, step.step, step.add_default_steps]), [['echo x', undefined, false], [undefined, 'global.cmds.a', false], [undefined, 'global.cmds.b', true]]);

    // Saving (configuration page) keeps the command
    list.save_to_file();
    const saved = new ExtendedSourceProcessingList(false).extended_source_processing[0];
    assert.strictEqual(saved.steps[0].cmd, 'echo x');
    assert.strictEqual(saved.steps[1].add_default_steps, false);
  });


  test('the settings of a source win over language settings and global variables (bugs.md #14)', () => {
    const general = AppConfig.get_app_config().general;
    const source = 'prouzalib/qrpglesrc/hello.rpgle.pgm';
    const config = { general, global: {
      settings: { general: { ACTGRP: 'GENERAL', TGTRLS: 'V7R4M0', TARGET_LIB: 'prodlib', TARGET_LIB_MAPPING: { prodlib: 'devlib' } }, language: { 'rpgle.pgm': { ACTGRP: 'LANGUAGE', TGTRLS: 'V7R5M0' } } },
      variables: { ACTGRP: 'VARIABLE', DBGVIEW: '*ALL' }
    } };
    const ctx = { source_configs: { [source]: { settings: { ACTGRP: 'SOURCE' } } }, properties: new Map() } as unknown as Parameters<typeof getSourceProperties>[2];

    const properties = getSourceProperties(config, source, ctx);
    assert.strictEqual(properties.ACTGRP, 'SOURCE');
    assert.strictEqual(properties.TGTRLS, 'V7R5M0', 'language settings win over global variables and general settings');
    assert.strictEqual(properties.DBGVIEW, '*ALL');
    assert.strictEqual(properties.TARGET_LIB, 'devlib');
    assert.strictEqual(properties.TARGET_LIB_ORIG, 'prodlib');
  });
});
