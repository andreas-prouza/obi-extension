import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';


const ROOT = path.resolve(__dirname, '..', '..', '..');
const read_json = (file: string) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

/** Commands of VS Code that the welcome texts may use */
const BUILT_IN = ['vscode.openFolder', 'workbench.action.openRecent', 'workbench.action.reloadWindow', 'workbench.action.openWalkthrough'];


suite('Welcome views', () => {

  const pkg = read_json('package.json');
  const own_commands = new Set<string>(pkg.contributes.commands.map((command: { command: string }) => command.command));


  test('the welcome and config-invalid views are tree views with welcome content', () => {
    const views = pkg.contributes.views['obi-bar'] as { id: string; type?: string }[];
    for (const id of ['obi-welcome', 'obi-config-invalid']) {
      assert.strictEqual(views.find(view => view.id === id)?.type, 'tree', id);
      assert.ok(pkg.contributes.viewsWelcome.some((entry: { view: string }) => entry.view === id), `${id} has welcome content`);
    }
  });


  test('every link of the welcome texts runs an existing command, in every language', () => {
    for (const file of fs.readdirSync(ROOT).filter(name => /^package\.nls(\.[a-z-]+)?\.json$/.test(name))) {
      const nls = read_json(file);
      for (const entry of pkg.contributes.viewsWelcome as { contents: string }[]) {
        const key = /^%(.+)%$/.exec(entry.contents)?.[1];
        assert.ok(key && typeof nls[key] === 'string', `${file}: text ${entry.contents}`);
        const commands = [...(nls[key] as string).matchAll(/\]\(command:([\w.-]+)/g)].map(match => match[1]);
        assert.ok(commands.length > 0, `${file}: ${key} has a button`);
        for (const command of commands)
          assert.ok(own_commands.has(command) || BUILT_IN.includes(command), `${file}: ${key} links to the unknown command ${command}`);
      }
    }
  });


  test('the walkthrough link names this extension and its walkthrough', () => {
    const id = `${pkg.publisher}.${pkg.name}#${pkg.contributes.walkthroughs[0].id}`;
    const nls = read_json('package.nls.json');
    for (const key of ['viewsWelcome.no-folder', 'viewsWelcome.no-project'])
      assert.ok((nls[key] as string).includes(`openWalkthrough?${encodeURIComponent(JSON.stringify([id]))}`), key);
  });
});
