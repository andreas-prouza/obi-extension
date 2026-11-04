import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { BackendUpdate } from '../../extension/obi/BackendUpdate';
import { SystemCmdError } from '../../shared/Errors';
import { BackendCheckout, backend_checkout, has_git } from '../git_fixture';


suite('Update of the local OBI backend (git pull)', function () {

  const saved: Record<string, string | undefined> = {};
  let repo: BackendCheckout;

  suiteSetup(function () {
    if (!has_git())
      this.skip();
  });

  setup(() => {
    repo = backend_checkout();
    // The code under test runs git with the environment of VS Code: the git config of the test, not the user's
    for (const [key, value] of Object.entries({ GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: repo.global_config })) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
  });

  teardown(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined)
        delete process.env[key];
      else
        process.env[key] = value;
    }
    await vscode.workspace.getConfiguration('obi').update('backend.autoUpdateLocal', undefined, vscode.ConfigurationTarget.Global);
    fs.rmSync(repo.root, { recursive: true, force: true });
  });

  const head = () => repo.git(repo.checkout, 'rev-parse', 'HEAD');


  test('up to date; updated, with changed requirements.txt', async () => {
    assert.deepStrictEqual(await BackendUpdate.pull_local(repo.checkout), { outcome: 'up-to-date', head: head() });

    const from = head();
    const to = repo.commit({ 'requirements.txt': 'smol-toml\ntomlkit\n' });
    assert.deepStrictEqual(await BackendUpdate.pull_local(repo.checkout), { outcome: 'updated', from, to, requirements_changed: true });
    assert.strictEqual(head(), to);

    const next = repo.commit({ 'main.py': 'print("next")\n' });
    assert.deepStrictEqual(await BackendUpdate.pull_local(repo.checkout), { outcome: 'updated', from: to, to: next, requirements_changed: false });
  });


  test('own commits: fails, the checkout stays as it is', async () => {
    repo.commit({ 'main.py': 'print("upstream")\n' });
    const own = repo.commit({ 'local.txt': 'own\n' }, repo.checkout);
    await assert.rejects(() => BackendUpdate.pull_local(repo.checkout), SystemCmdError);
    assert.strictEqual(head(), own);
  });


  test('a folder without .git is not updated', async () => {
    const plain = path.join(repo.root, 'plain');
    fs.mkdirSync(plain);
    assert.deepStrictEqual(await BackendUpdate.pull_local(plain), { outcome: 'not-a-repository' });
  });


  test('on start: only with obi.backend.autoUpdateLocal, and once per session', async () => {
    const before = head();
    repo.commit({ 'main.py': 'print("new")\n' });

    await BackendUpdate.update_local_on_start(repo.checkout);
    assert.strictEqual(head(), before, 'setting off: nothing happens');

    await vscode.workspace.getConfiguration('obi').update('backend.autoUpdateLocal', true, vscode.ConfigurationTarget.Global);
    await BackendUpdate.update_local_on_start(repo.checkout);
    const updated = head();
    assert.notStrictEqual(updated, before, 'updated');

    repo.commit({ 'main.py': 'print("newer")\n' });
    await BackendUpdate.update_local_on_start(repo.checkout);
    assert.strictEqual(head(), updated, 'only once per session');
  });
});
