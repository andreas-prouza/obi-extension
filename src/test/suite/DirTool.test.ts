import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { DirTool } from '../../extension/utilities/DirTool';
import { ConfigFileError } from '../../shared/Errors';
import { Constants } from '../../shared/Constants';
import { Workspace } from '../../extension/utilities/Workspace';
import { OBISourceConfiguration } from '../../webview/controller/OBISourceConfiguration';
import { ExtendedSourceProcessingList } from '../../extension/config/EspConfig';
import { AppConfig } from '../../extension/config/AppConfig';
import { reset_workspace } from './workspace_fixture';


suite('DirTool writes and config protection', () => {

  let dir: string;

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-dirtool-'));
  });

  teardown(() => {
    fs.chmodSync(dir, 0o755);
    fs.rmSync(dir, { recursive: true, force: true });
  });


  test('write_json writes atomically and leaves no temp file', () => {
    const file = path.join(dir, 'a.json');
    DirTool.write_json(file, { a: 1 });
    DirTool.write_json(file, { a: 2 });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { a: 2 });
    assert.deepStrictEqual(fs.readdirSync(dir), ['a.json']);
  });


  test('a failed write throws and keeps the original file', function () {
    if (process.platform === 'win32' || process.getuid?.() === 0)
      this.skip();   // directory permissions don't prevent writes there

    const file = path.join(dir, 'a.json');
    DirTool.write_json(file, { a: 1 });
    fs.chmodSync(dir, 0o555);
    assert.throws(() => DirTool.write_json(file, { a: 2 }));
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { a: 1 });
  });


  test('update_json refuses to overwrite a file that cannot be parsed', () => {
    const file = path.join(dir, 'dependency.json');
    fs.writeFileSync(file, '{ "a": [ "b" ], ');
    assert.throws(() => DirTool.update_json(file, {}), (e: unknown) => e instanceof ConfigFileError && e.line === 1);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '{ "a": [ "b" ], ');
  });


  test('update_json accepts missing and empty files (created empty by older versions)', () => {
    const missing = path.join(dir, 'missing.json');
    DirTool.update_json(missing, { x: 1 });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(missing, 'utf8')), { x: 1 });

    const empty = path.join(dir, 'empty.json');
    fs.writeFileSync(empty, '');
    DirTool.update_json(empty, { y: 1 });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(empty, 'utf8')), { y: 1 });
  });


  test('update_toml refuses to overwrite invalid TOML and reports the position', () => {
    const file = path.join(dir, 'source-config.toml');
    fs.writeFileSync(file, '["lib/qrpglesrc/a.rpgle.pgm".settings]\nACTGRP = "x\n');
    assert.throws(() => DirTool.update_toml(file, {}), (e: unknown) => e instanceof ConfigFileError && e.line === 2);
    assert.ok(fs.readFileSync(file, 'utf8').includes('ACTGRP'));
  });
});


suite('Source config page does not lose other sources', () => {

  const source_config_file = () => path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE);

  // Other suites change the shared test workspace: start every test from the fixture
  setup(async () => {
    await reset_workspace();
    OBISourceConfiguration.source_config = 'lib/qrpglesrc/new.rpgle.pgm';
  });


  test('adding a setting to a source without entry keeps the other sources and uses real keys', () => {
    fs.writeFileSync(source_config_file(), '["lib/qrpglesrc/other.rpgle.pgm".settings]\nACTGRP = "keep"\n');
    OBISourceConfiguration['add_source_setting']('TGTRLS', '*CURRENT');

    const content = DirTool.read_toml_strict<Record<string, { settings?: Record<string, string> }>>(source_config_file()) ?? {};
    assert.strictEqual(content['lib/qrpglesrc/other.rpgle.pgm']?.settings?.ACTGRP, 'keep');
    assert.strictEqual(content['lib/qrpglesrc/new.rpgle.pgm']?.settings?.TGTRLS, '*CURRENT');
    assert.ok(!('source_name' in content), 'no literal "source_name" entry');
  });


  test('saving after a hand-made syntax error leaves the file untouched', () => {
    const broken = '["lib/qrpglesrc/other.rpgle.pgm".settings]\nACTGRP = \n';
    fs.writeFileSync(source_config_file(), broken);
    assert.throws(() => OBISourceConfiguration['save_config']({}, {}, []), ConfigFileError);
    assert.strictEqual(fs.readFileSync(source_config_file(), 'utf8'), broken);
  });


  test('an unreadable ESP file is not deleted when the (empty) list is saved', () => {
    const esp_file = path.join(Workspace.get_workspace(), Constants.EXTENDED_SOURCE_PROCESS_CONFIG);
    fs.writeFileSync(esp_file, '[[extended_source_processing]]\nuse_regex = \n');
    const esp = new ExtendedSourceProcessingList(false);
    assert.strictEqual(esp.extended_source_processing.length, 0);
    assert.throws(() => esp.save_to_file(), ConfigFileError);
    assert.ok(fs.existsSync(esp_file));
  });
});


suite('Local paths become OBI source names', () => {

  teardown(() => sinon.restore());


  test('a file in the source folder gives lib/file/member, other files give undefined', () => {
    const ws = Workspace.get_workspace();
    assert.strictEqual(DirTool.to_obi_source(path.join(ws, 'src', 'prouzalib', 'qrpglesrc', 'hello.rpgle.pgm')), 'prouzalib/qrpglesrc/hello.rpgle.pgm');
    assert.strictEqual(DirTool.to_obi_source(path.join(ws, '.obi', 'etc', 'app-config.toml')), undefined);
    assert.strictEqual(DirTool.to_workspace_relative(path.join(ws, '.obi', 'etc', 'app-config.toml')), '.obi/etc/app-config.toml');
  });


  test('local-base-dir is part of the source folder', () => {
    const config = AppConfig.get_app_config();
    sinon.stub(AppConfig, 'get_app_config').returns({ ...config, general: { ...config.general, 'local-base-dir': 'base', 'source-dir': 'src' } } as AppConfig);
    const ws = Workspace.get_workspace();

    assert.strictEqual(DirTool.get_local_source_dir(), path.join(ws, 'base', 'src'));
    assert.strictEqual(DirTool.to_obi_source(path.join(ws, 'base', 'src', 'lib', 'qrpglesrc', 'a.rpgle.pgm')), 'lib/qrpglesrc/a.rpgle.pgm');
    assert.strictEqual(DirTool.to_obi_source(path.join(ws, 'src', 'lib', 'qrpglesrc', 'a.rpgle.pgm')), undefined);
    assert.ok(decodeURIComponent(DirTool.get_encoded_source_URI('lib/qrpglesrc/a.rpgle.pgm')).includes(['base', 'src', 'lib'].join(path.sep === '\\' ? '\\\\' : '/')));
  });
});


suite('File links use the workspace folder URI', () => {

  teardown(() => sinon.restore());


  test('remote workspace: scheme and authority of the workspace folder are kept', () => {
    sinon.stub(Workspace, 'get_workspace_uri').returns(vscode.Uri.parse('vscode-remote://ssh-remote+host/home/u/ws'));
    assert.strictEqual(DirTool.get_file_URI('.obi/etc/app-config.toml').toString(), 'vscode-remote://ssh-remote%2Bhost/home/u/ws/.obi/etc/app-config.toml');
  });


  test('backslashes and ./ in relative paths are path separators', () => {
    sinon.stub(Workspace, 'get_workspace_uri').returns(vscode.Uri.parse('vscode-remote://wsl+Ubuntu/home/u/ws'));
    assert.strictEqual(DirTool.get_file_URI('.\\src\\lib\\x.pgm').path, '/home/u/ws/src/lib/x.pgm');
  });


  test('the encoded link revives to the same URI', () => {
    const file = path.join('src', 'prouzalib', 'qrpglesrc', 'hello.rpgle.pgm');
    const revived = vscode.Uri.from(JSON.parse(decodeURIComponent(DirTool.get_encoded_file_URI(file))));
    assert.strictEqual(revived.toString(), vscode.Uri.joinPath(Workspace.get_workspace_uri(), 'src', 'prouzalib', 'qrpglesrc', 'hello.rpgle.pgm').toString());
  });


  test('absolute paths inside the workspace become workspace links', () => {
    const file = path.join(Workspace.get_workspace(), '.obi', 'etc', 'app-config.toml');
    assert.strictEqual(DirTool.get_file_URI(file).toString(), vscode.Uri.joinPath(Workspace.get_workspace_uri(), '.obi', 'etc', 'app-config.toml').toString());
  });
});
