import assert from 'assert';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PULL_ARGS, parse_pull_output, pull_result, remote_pull_script } from '../../shared/GitPull';
import { backend_checkout, git_env, has_git } from '../git_fixture';


const A = 'a'.repeat(40);
const B = 'b'.repeat(40);


suite('OBI backend update (git pull)', () => {

  test('result: up to date, updated, requirements.txt changed', () => {
    assert.deepStrictEqual(pull_result(A, A, []), { outcome: 'up-to-date', head: A });
    assert.deepStrictEqual(pull_result(A, B, ['main.py']), { outcome: 'updated', from: A, to: B, requirements_changed: false });
    assert.deepStrictEqual(pull_result(A, B, ['module/x.py', 'requirements.txt']), { outcome: 'updated', from: A, to: B, requirements_changed: true });
    assert.deepStrictEqual(pull_result(A, B, ['docs/requirements.txt']), { outcome: 'updated', from: A, to: B, requirements_changed: false });
  });


  test('parse_pull_output reads the marker line and the changed files after it', () => {
    const output = ['Updating aaaaaaa..bbbbbbb', 'Fast-forward', ' requirements.txt | 1 +', `OBI-PULL ${A} ${B}`, 'main.py', 'requirements.txt'];
    assert.deepStrictEqual(parse_pull_output(output), { outcome: 'updated', from: A, to: B, requirements_changed: true });
    assert.deepStrictEqual(parse_pull_output(['Already up to date.', `OBI-PULL ${A} ${A}`]), { outcome: 'up-to-date', head: A });
    assert.deepStrictEqual(parse_pull_output(['OBI-PULL no-repository']), { outcome: 'not-a-repository' });
    for (const garbage of [[], ['Already up to date.'], ['OBI-PULL'], [`OBI-PULL ${A}`], ['OBI-PULL x y'], [`OBI-PULL ${A} ${B} extra`]])
      assert.strictEqual(parse_pull_output(garbage), undefined, JSON.stringify(garbage));
  });


  test('the remote script quotes the folder and never asks', () => {
    const script = remote_pull_script(`/home/max/my obi's dir`);
    assert.ok(script.includes(`cd '/home/max/my obi'\\''s dir' || exit 1`), script);
    assert.ok(script.includes('GIT_TERMINAL_PROMPT=0'));
    assert.ok(script.includes(`git ${PULL_ARGS.join(' ')} || exit 1`));
  });


  suite('the remote script with real repositories (bash and git)', function () {

    const run = (checkout: { global_config: string }, dir: string) => {
      const result = spawnSync('bash', ['-c', remote_pull_script(dir)], { env: git_env(checkout.global_config), encoding: 'utf8' });
      return { code: result.status, lines: result.stdout.split(/\r?\n/).filter(line => line.length > 0), stderr: result.stderr };
    };

    suiteSetup(function () {
      if (process.platform === 'win32' || !has_git())
        this.skip();
    });


    test('up to date, then updated with new requirements', () => {
      const repo = backend_checkout();
      const first = run(repo, repo.checkout);
      assert.strictEqual(first.code, 0, first.stderr);
      assert.strictEqual(parse_pull_output(first.lines)?.outcome, 'up-to-date');

      const from = repo.git(repo.checkout, 'rev-parse', 'HEAD');
      const to = repo.commit({ 'requirements.txt': 'smol-toml\ntomlkit\n', 'main.py': 'print("obi 2")\n' });
      const second = run(repo, repo.checkout);
      assert.strictEqual(second.code, 0, second.stderr);
      assert.deepStrictEqual(parse_pull_output(second.lines), { outcome: 'updated', from, to, requirements_changed: true });
      assert.strictEqual(fs.readFileSync(path.join(repo.checkout, 'main.py'), 'utf8'), 'print("obi 2")\n');
    });


    test('pull.rebase in the git config of the user: still only a fast-forward', () => {
      const repo = backend_checkout('[pull]\n\trebase = true\n');
      repo.commit({ 'main.py': 'print("upstream")\n' });
      repo.commit({ 'local.txt': 'own commit\n' }, repo.checkout);
      const own = repo.git(repo.checkout, 'rev-parse', 'HEAD');

      const result = run(repo, repo.checkout);
      assert.strictEqual(result.code, 1, 'diverged: fails instead of rebasing');
      assert.strictEqual(repo.git(repo.checkout, 'rev-parse', 'HEAD'), own, 'own commit untouched');
    });


    test('a folder that is not a git repository; a missing folder', () => {
      const repo = backend_checkout();
      const plain = path.join(repo.root, 'plain');
      fs.mkdirSync(plain);
      assert.deepStrictEqual(parse_pull_output(run(repo, plain).lines), { outcome: 'not-a-repository' });
      assert.strictEqual(run(repo, path.join(repo.root, 'missing')).code, 1);
    });
  });
});
