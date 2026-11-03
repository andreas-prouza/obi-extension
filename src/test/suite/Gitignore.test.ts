import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { offer_gitignore_entries, write_initial_gitignore } from '../../extension/obi/GitignoreCheck';


function fake_context(): vscode.ExtensionContext {
  const state = new Map<string, unknown>();
  return { workspaceState: { get: (k: string) => state.get(k), update: async (k: string, v: unknown) => { state.set(k, v); } } } as unknown as vscode.ExtensionContext;
}


suite('Recommended .gitignore entries', () => {

  let dir: string;

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-git-'));
  });

  teardown(() => {
    sinon.restore();
    fs.rmSync(dir, { recursive: true, force: true });
  });


  test('a new project gets the .gitignore; an existing one is not touched', () => {
    write_initial_gitignore(dir);
    assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), /\.obi\/etc\/\.user-app-config\*\.toml/);

    fs.writeFileSync(path.join(dir, '.gitignore'), 'mine\n');
    write_initial_gitignore(dir);
    assert.strictEqual(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), 'mine\n');
  });


  test('git project without the entries: asked once, entries appended', async function () {
    try { execFileSync('git', ['init', '-q'], { cwd: dir }); }
    catch { this.skip(); }   // no git
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
    const ask = sinon.stub(vscode.window, 'showInformationMessage').resolves('Add entries' as unknown as vscode.MessageItem);
    const context = fake_context();

    await offer_gitignore_entries(context, dir);
    const content = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
    assert.ok(content.startsWith('node_modules/\n'));
    assert.match(content, /\.obi\/build-history\//);

    await offer_gitignore_entries(context, dir);
    assert.strictEqual(ask.callCount, 1, 'not asked again');
  });


  test('no git repository: no question', async () => {
    const ask = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    await offer_gitignore_entries(fake_context(), dir);
    assert.ok(ask.notCalled);
  });
});
