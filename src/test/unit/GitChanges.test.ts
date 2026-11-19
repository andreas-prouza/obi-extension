import assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detect_base_branch, files_changed_since, is_valid_base_branch } from '../../extension/utilities/GitChanges';
import { git_env, has_git } from '../git_fixture';


suite('Files changed on the current branch (git)', () => {

  const created: string[] = [];
  teardown(() => created.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

  /** Repository with src/ and a commit on main; then branch feature */
  function repository(): { root: string; env: NodeJS.ProcessEnv; git: (...args: string[]) => string; write: (file: string, content: string) => void } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-git-changes-'));
    created.push(root);
    const config = path.join(root, '.gitconfig-test');
    fs.writeFileSync(config, '');
    const env = git_env(config);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8' }).trim();
    const write = (file: string, content: string) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), content);
    };
    git('init', '-q', '-b', 'main');
    write('.gitignore', '.gitconfig-test\nsrc/lib/q/ignored.pgm\n');
    write('src/lib/q/a.pgm', 'a');
    write('src/lib/q/b.pgm', 'b');
    write('src/lib/q/gone.pgm', 'x');
    write('docs/readme.md', 'r');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'feature');
    return { root, env, git, write };
  }


  test('branch names that can be passed to git', () => {
    for (const name of ['main', 'origin/main', 'release/2.1', 'feature_x-1'])
      assert.ok(is_valid_base_branch(name), name);
    for (const name of ['', '-main', '--output=x', 'a..b', 'a b', 'main/', 'a;b'])
      assert.ok(!is_valid_base_branch(name), JSON.stringify(name));
  });


  test('committed, not committed and untracked changes below the folder; not deleted and not ignored files', function () {
    if (!has_git())
      this.skip();
    const repo = repository();
    repo.write('src/lib/q/a.pgm', 'a2');
    repo.git('commit', '-q', '-am', 'change a');
    repo.write('src/lib/q/b.pgm', 'b2');           // not committed
    repo.write('src/lib/q/new.pgm', 'n');          // untracked
    repo.write('src/lib/q/ignored.pgm', 'i');      // ignored
    repo.write('docs/readme.md', 'r2');            // outside the source folder
    repo.git('rm', '-q', 'src/lib/q/gone.pgm');

    const changes = files_changed_since(path.join(repo.root, 'src'), 'main', repo.env);

    assert.strictEqual(changes.base, 'main');
    assert.strictEqual(changes.merge_base, repo.git('rev-parse', 'main'));
    assert.deepStrictEqual(changes.files, ['lib/q/a.pgm', 'lib/q/b.pgm', 'lib/q/new.pgm']);
  });


  test('changes on the base branch after the branch started are not listed', function () {
    if (!has_git())
      this.skip();
    const repo = repository();
    repo.git('checkout', '-q', 'main');
    repo.write('src/lib/q/b.pgm', 'on main');
    repo.git('commit', '-q', '-am', 'main moves on');
    repo.git('checkout', '-q', 'feature');
    repo.write('src/lib/q/a.pgm', 'a2');

    assert.deepStrictEqual(files_changed_since(path.join(repo.root, 'src'), 'main', repo.env).files, ['lib/q/a.pgm']);
  });


  test('base branch: detected (main), unknown or invalid ones are errors', function () {
    if (!has_git())
      this.skip();
    const repo = repository();
    assert.strictEqual(detect_base_branch(repo.root, repo.env), 'main');
    assert.throws(() => files_changed_since(repo.root, 'develop', repo.env), /develop/);
    assert.throws(() => files_changed_since(repo.root, '--output=/tmp/x', repo.env), /Invalid branch name/);

    const no_repo = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-no-git-'));
    created.push(no_repo);
    assert.strictEqual(detect_base_branch(no_repo, repo.env), undefined);
  });
});
