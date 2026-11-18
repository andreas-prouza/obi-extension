import assert from 'assert';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AppConfig } from '../../extension/config/AppConfig';
import { OBICommands } from '../../extension/obi/OBICommands';
import { DirTool } from '../../extension/utilities/DirTool';
import { Workspace } from '../../extension/utilities/Workspace';
import { reset_workspace } from './workspace_fixture';


const source = 'prouzalib/qrpglesrc/hello.rpgle.pgm';

const object_list_file = () => path.join(Workspace.get_workspace(), AppConfig.get_app_config().general['compiled-object-list']);
const object_list = () => JSON.parse(fs.readFileSync(object_list_file(), 'utf8')) as Record<string, unknown>;


suite('Hash of a source in the compiled object list', () => {

  let info: sinon.SinonStub;

  setup(async () => {
    await reset_workspace();
    info = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
  });

  teardown(() => sinon.restore());


  test('store the current hash, store it again, remove it, remove it again; other entries are kept', async () => {
    fs.writeFileSync(object_list_file(), JSON.stringify({ 'other/qrpglesrc/x.rpgle.pgm': 'abc' }));
    const md5 = crypto.createHash('md5').update(fs.readFileSync(path.join(DirTool.get_local_source_dir(), source))).digest('hex');

    await OBICommands.store_source_hash(source);
    assert.deepStrictEqual(object_list(), { 'other/qrpglesrc/x.rpgle.pgm': 'abc', [source]: md5 });
    assert.match(String(info.lastCall.args[0]), /current hash stored in .*It counts as built/);

    await OBICommands.store_source_hash(source);
    assert.match(String(info.lastCall.args[0]), /the current hash is already stored/);

    await OBICommands.remove_source_hash(source);
    assert.deepStrictEqual(object_list(), { 'other/qrpglesrc/x.rpgle.pgm': 'abc' });
    assert.match(String(info.lastCall.args[0]), /hash removed from .*It counts as new/);

    await OBICommands.remove_source_hash(source);
    assert.match(String(info.lastCall.args[0]), /has no hash in/);
  });


  test('an invalid object list is not overwritten; missing source and unsupported type change nothing', async () => {
    const error = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    const warning = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);

    fs.writeFileSync(object_list_file(), '{ broken');
    await OBICommands.store_source_hash(source);
    assert.strictEqual(fs.readFileSync(object_list_file(), 'utf8'), '{ broken');
    assert.ok(error.calledOnce);

    fs.writeFileSync(object_list_file(), '{}');
    await OBICommands.store_source_hash('prouzalib/qrpglesrc/missing.rpgle.pgm');
    await OBICommands.store_source_hash('prouzalib/qrpglesrc/readme.txt');
    assert.deepStrictEqual(object_list(), {});
    assert.ok(error.calledTwice);
    assert.ok(warning.calledOnce);
    assert.ok(info.notCalled);
  });
});
