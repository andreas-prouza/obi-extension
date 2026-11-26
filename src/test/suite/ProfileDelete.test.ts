import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Workspace } from '../../extension/utilities/Workspace';
import { delete_current_profile } from '../../extension/config/ProfileDelete';
import { reset_workspace } from './workspace_fixture';


const DEFAULT_CONFIG = '.obi/etc/.user-app-config.toml';
const DEV_CONFIG = '.obi/etc/.user-app-config-dev.toml';
const DEV_ESP = '.obi/etc/.user-extended-source-processing-config-dev.toml';


/** Secret storage and workspaceState that record what was removed */
function fake_storage() {
  const deleted_secrets: string[] = [];
  const cleared_state: string[] = [];
  const storage = {
    secrets: { delete: async (key: string) => { deleted_secrets.push(key); } },
    workspaceState: { update: async (key: string, value: unknown) => { if (value === undefined) cleared_state.push(key); } }
  } as unknown as Pick<vscode.ExtensionContext, 'secrets' | 'workspaceState'>;
  return { storage, deleted_secrets, cleared_state };
}

const exists = (file: string) => fs.existsSync(path.join(Workspace.get_workspace(), file));


suite('Delete profile', () => {

  setup(async () => {
    await reset_workspace();
    const ws = Workspace.get_workspace();
    fs.writeFileSync(path.join(ws, DEFAULT_CONFIG), '[connection]\nremote-host = "prod.host"\nssh-user = "produser"\n');
    fs.writeFileSync(path.join(ws, DEV_CONFIG), '[connection]\nremote-host = "dev.host"\nssh-user = "devuser"\n');
    fs.writeFileSync(path.join(ws, DEV_ESP), '');
    Workspace.change_profile('dev');
  });

  teardown(() => {
    sinon.restore();
    Workspace.change_profile('');
  });


  test('after the confirmation: files, password and passphrase of the profile are gone, the default profile is active', async () => {
    const warning = sinon.stub(vscode.window, 'showWarningMessage').resolves('Delete' as unknown as vscode.MessageItem);
    const { storage, deleted_secrets, cleared_state } = fake_storage();

    assert.strictEqual(await delete_current_profile(storage), true);

    const [question, options] = warning.firstCall.args as unknown as [string, vscode.MessageOptions];
    assert.strictEqual(question, 'Delete profile dev?');
    assert.ok(options.modal);
    const detail = options.detail ?? '';
    assert.ok(detail.includes(DEV_CONFIG) && detail.includes(DEV_ESP), detail);

    assert.ok(!exists(DEV_CONFIG) && !exists(DEV_ESP));
    assert.ok(exists(DEFAULT_CONFIG), 'the default profile stays');
    assert.strictEqual(Workspace.get_current_profile() ?? '', '');
    assert.deepStrictEqual(deleted_secrets, ['obi|dev|dev.host|devuser', 'obi|dev|dev.host|devuser|passphrase']);
    assert.deepStrictEqual(cleared_state, ['obi.ssh.never-save-password|dev', 'obi.ssh.never-save-passphrase|dev']);
  });


  test('cancelled: nothing is deleted', async () => {
    sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    const { storage, deleted_secrets } = fake_storage();

    assert.strictEqual(await delete_current_profile(storage), false);
    assert.ok(exists(DEV_CONFIG) && exists(DEV_ESP));
    assert.strictEqual(Workspace.get_current_profile(), 'dev');
    assert.deepStrictEqual(deleted_secrets, []);
  });


  test('the default profile is never deleted, not even on a message of an older page', async () => {
    Workspace.change_profile('');
    const warning = sinon.stub(vscode.window, 'showWarningMessage');
    const info = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const { storage, deleted_secrets } = fake_storage();

    assert.strictEqual(await delete_current_profile(storage), false);
    assert.ok(warning.notCalled);
    assert.match(String(info.firstCall.args[0]), /default profile can't be deleted/);
    assert.ok(exists(DEFAULT_CONFIG));
    assert.deepStrictEqual(deleted_secrets, []);
  });
});
