import assert from 'assert';
import * as path from 'path';
import * as fse from 'fs-extra';
import * as sinon from 'sinon';
import { Workspace } from '../../extension/utilities/Workspace';
import { AppConfig } from '../../extension/config/AppConfig';
import { DirTool } from '../../extension/utilities/DirTool';
import { DependencyList } from '../../extension/obi/Dependency';
import { createBuildList } from '../../extension/obi/compile_list/createBuildList';
import { reset_workspace } from './workspace_fixture';


const GOLDEN = path.resolve(__dirname, '../../../test-resources/golden/compile-list.json');

const SOURCES: Record<string, string> = {
  'prouzalib/qrpglesrc/test4.rpgle.pgm': '**free\ndsply \'test4\';',
  'prouzalib/qrpglesrc/srv.sqlrpgle.srvpgm': '**free\nctl-opt nomain;',
  'prouzalib/qrpglesrc/defs.rpgle.cpy': '**free\ndcl-c X 1;',
  'prouzalib/qddssrc/cust.pf.file': '     A          R CUSTR',
  'prouzalib/qsqlsrc/orders.sqltable.file': 'create table orders (id int);',
};

const ESP = `
[[extended_source_processing]]
use_regex = false
allow_multiple_matches = true

[extended_source_processing.conditions]
SOURCE_FILE_NAMES = [ "*.sqlrpgle.srvpgm" ]

[[extended_source_processing.steps]]
add_default_steps = true

[extended_source_processing.steps.properties]
TARGET_LIB = "ESPLIB"
`;


/** Compile list without the values that change on every run */
function stable(compile_list: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...compile_list };
  delete rest.timestamp;
  delete rest.git;
  return rest;
}


suite('Build list golden test', () => {

  setup(async () => {
    const ws = Workspace.get_workspace();
    await reset_workspace();

    for (const [source, content] of Object.entries(SOURCES)) {
      await fse.outputFile(path.join(ws, 'src', source), content);
    }
    await fse.appendFile(path.join(ws, '.obi/etc/app-config.toml'), '\n[global.variables]\nINCLUDE_BNDDIR = "MYBND"\nsecret_password = "do-not-leak"\n');
    await fse.outputFile(path.join(ws, '.obi/etc/extended-source-processing-config.toml'), ESP);
    DirTool.write_json(path.join(ws, '.obi/etc/dependency.json'), {
      'prouzalib/qrpglesrc/hello.rpgle.pgm': ['prouzalib/qrpglesrc/defs.rpgle.cpy', 'prouzalib/qrpglesrc/srv.sqlrpgle.srvpgm'],
      'prouzalib/qrpglesrc/srv.sqlrpgle.srvpgm': ['prouzalib/qddssrc/cust.pf.file'],
    });
    DirTool.write_json(path.join(ws, '.obi/etc/object-builds.json'), {});

    AppConfig.reset();
    await DependencyList.load_dependencies();
  });

  teardown(async () => {
    sinon.restore();
    await fse.copy(path.resolve(__dirname, '../../../test-resources/appconfig/.obi/etc'), path.join(Workspace.get_workspace(), '.obi/etc'));
    AppConfig.reset();
    await DependencyList.load_dependencies();
  });


  test('compile list of the scenario is unchanged (set OBI_UPDATE_GOLDEN=1 to rewrite it)', async () => {
    await createBuildList();

    const ws = Workspace.get_workspace();
    const compile_list = stable(DirTool.read_json_strict<Record<string, unknown>>(path.join(ws, AppConfig.get_app_config().general['compile-list'] ?? '')) ?? {});
    const deployment_list = await fse.readFile(path.join(ws, '.obi/build-output/object-list.txt'), 'utf8');
    const actual = { compile_list, deployment_list };

    assert.ok(!JSON.stringify(actual).includes('do-not-leak'), 'secret variables are not written');

    if (process.env.OBI_UPDATE_GOLDEN) {
      await fse.outputFile(GOLDEN, JSON.stringify(actual, null, 2) + '\n');
      return;
    }
    assert.deepStrictEqual(actual, JSON.parse(await fse.readFile(GOLDEN, 'utf8')));
  });


  test('source-config.toml is parsed once per run, and the config is never modified', async () => {
    const deep_freeze = (value: unknown): void => {
      if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value).forEach(deep_freeze);
      }
    };
    const config = AppConfig.get_app_config();
    deep_freeze(config);   // a write into it throws (strict mode)

    const strict = sinon.spy(DirTool, 'read_toml_strict');
    const lenient = sinon.spy(DirTool, 'get_toml');
    await createBuildList();

    const reads = [...strict.getCalls(), ...lenient.getCalls()].filter(call => String(call.args[0]).endsWith('source-config.toml'));
    assert.strictEqual(reads.length, 1);
    assert.strictEqual((config.global.variables as Record<string, unknown>)['secret_password'], 'do-not-leak', 'secret variables stay in the config');
  });
});
