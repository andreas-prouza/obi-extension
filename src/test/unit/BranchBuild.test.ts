import assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { backend_version_of, branch_args, branch_build_active, branch_for_text, branch_mismatch, build_context_of, deployment_guard, group_by_ticket, is_unknown_branch_argument, lib_text_of_branch, parse_branch_libs_output, same_lib, ticket_state, GuardInput } from '../../shared/BranchBuild';
import { render_status } from '../../extension/utilities/StatusText';
import { commit_on_remote_branch, has_uncommitted_changes, is_merged_into, list_branches } from '../../extension/utilities/GitChanges';
import { git_env, has_git } from '../git_fixture';


const BRANCH = { build_context: { mode: 'branch', branch: 'PROJ-337-order', ticket: '337', libs: ['#aa_337', '#bb_337'] } };


suite('Branch build: rules of the extension (spec obi-extension-branch-build-spec.md)', () => {

  test('active: the section exists and doesn\'t set enabled = false (only the boolean, as the backend)', () => {
    assert.ok(branch_build_active({ 'ticket-pattern': 'x' }));
    assert.ok(branch_build_active({ enabled: true }));
    assert.ok(branch_build_active({ enabled: 'false' }), 'a string is not the boolean');
    assert.ok(!branch_build_active({ enabled: false }));
    assert.ok(!branch_build_active(undefined));
    assert.ok(!branch_build_active([]));
  });

  test('build_context of a compile list', () => {
    assert.deepStrictEqual(build_context_of(BRANCH), { mode: 'branch', branch: 'PROJ-337-order', ticket: '337', libs: ['#aa_337', '#bb_337'], warning: undefined, error: undefined });
    assert.deepStrictEqual(build_context_of({ build_context: { mode: 'main', branch: null, ticket: null, libs: [], warning: 'No git repository' } })?.warning, 'No git repository');
    assert.strictEqual(build_context_of({ compiles: [] }), undefined);
    assert.strictEqual(build_context_of({ build_context: { mode: 'x' } }), undefined);
    assert.ok(same_lib('#aa_337', '#AA_337'));
  });

  test('B7: a list runs only on the branch it was created on', () => {
    const context = build_context_of(BRANCH);
    assert.strictEqual(branch_mismatch(context, 'PROJ-337-order'), undefined);
    assert.strictEqual(branch_mismatch(context, 'main'), 'PROJ-337-order');
    assert.strictEqual(branch_mismatch(context, 'PROJ-337-other-name'), 'PROJ-337-order', 'the extension compares names, not tickets');
    assert.strictEqual(branch_mismatch(build_context_of({ build_context: { mode: 'main', branch: null, libs: [] } }), undefined), undefined, 'no git then and now');
    assert.strictEqual(branch_mismatch(undefined, 'main'), undefined, 'without context nothing to compare');
  });

  test('backend version, old backend, --branch', () => {
    assert.strictEqual(backend_version_of('class OBIConstants:\n    OBI_BACKEND_VERSION = 6\n'), 6);
    assert.strictEqual(backend_version_of('nothing'), undefined);
    assert.ok(is_unknown_branch_argument('main.py: error: unrecognized arguments: --branch=PROJ-1'));
    assert.ok(!is_unknown_branch_argument('unrecognized arguments: --package=x'));
    assert.deepStrictEqual(branch_args('PROJ-1-x'), ['--branch=PROJ-1-x']);
    assert.deepStrictEqual(branch_args(undefined), []);
  });

  test('deployment guard D1-D4', () => {
    const base: GuardInput = { main_branch: 'main', feature_active: true, git: { branch: 'main', commit: 'abcdef1' }, context: build_context_of({ build_context: { mode: 'main', branch: 'main', libs: [] } }), is_package: true, commit_on_main: true };
    const rules = (input: Partial<GuardInput>) => deployment_guard({ ...base, ...input }).map(reason => `${reason.rule}:${reason.kind}`);

    assert.deepStrictEqual(rules({}), [], 'package build of a pushed commit on main');
    assert.deepStrictEqual(rules({ git: undefined }), ['D1:no-git']);
    assert.deepStrictEqual(rules({ git: { branch: 'PROJ-337-x', commit: 'abcdef1' }, context: build_context_of(BRANCH) }), ['D1:branch', 'D2:mode']);
    assert.deepStrictEqual(rules({ commit_on_main: false }), ['D1:commit']);
    assert.deepStrictEqual(rules({ is_package: false }), ['D3:package']);
    assert.deepStrictEqual(rules({ git: { branch: 'main', commit: 'abcdef1', dirty: true } }), ['D4:dirty']);
    assert.deepStrictEqual(rules({ context: undefined }), ['D2:mode'], 'a list without build_context while the feature is on');
    // Feature off: only D1, if main-branch is set
    assert.deepStrictEqual(rules({ feature_active: false, is_package: false, context: undefined }), []);
    assert.deepStrictEqual(rules({ feature_active: false, git: { branch: 'dev', commit: 'abcdef1' } }), ['D1:branch']);
    assert.deepStrictEqual(rules({ feature_active: false, main_branch: '', git: undefined }), [], 'feature off and no main-branch: as today');
  });

  test('status bar: ticket and libraries, main libraries, a list of another branch', () => {
    const state = { profile: 'AA' };
    assert.match(render_status({ ...state, branch_build: { mode: 'branch', ticket: '337', libs: ['#aa_337', '#bb_337'] } }).text, /\$\(git-branch\) #337 → #aa_337, #bb_337/);
    assert.match(render_status({ ...state, branch_build: { mode: 'main', libs: [] } }).text, /main libraries/);
    const other = render_status({ ...state, branch_build: { mode: 'branch', ticket: '337', libs: ['#aa_337'], created_on_other_branch: 'PROJ-337-order' } });
    assert.match(other.text, /\$\(warning\)/);
    assert.match(other.tooltip, /created on branch PROJ-337-order/);
    assert.doesNotMatch(render_status(state).text, /git-branch/, 'feature off: nothing new');
  });
});


suite('Branch build: git checks of the deployment guard', () => {

  const created: string[] = [];
  teardown(() => created.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

  test('uncommitted changes below a folder; a commit on origin/main', function () {
    if (!has_git())
      this.skip();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-branch-git-'));
    created.push(root);
    const config = path.join(root, 'gitconfig');
    fs.writeFileSync(config, '');
    const env = git_env(config);
    const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
    const origin = path.join(root, 'origin.git');
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, work);
    fs.mkdirSync(path.join(work, 'src'));
    fs.writeFileSync(path.join(work, 'src', 'a.pgm'), 'a');
    fs.writeFileSync(path.join(work, 'readme.md'), 'r');
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', 'first');
    git(work, 'push', '-q', 'origin', 'main');
    const pushed = git(work, 'rev-parse', 'HEAD');

    const src = path.join(work, 'src');
    assert.strictEqual(has_uncommitted_changes(src, env), false);
    fs.writeFileSync(path.join(work, 'readme.md'), 'changed outside src');
    assert.strictEqual(has_uncommitted_changes(src, env), false, 'only the source folder counts');
    fs.writeFileSync(path.join(src, 'new.pgm'), 'untracked');
    assert.strictEqual(has_uncommitted_changes(src, env), true);
    assert.strictEqual(has_uncommitted_changes(root, env), undefined, 'not a repository');

    assert.strictEqual(commit_on_remote_branch(work, pushed, 'main', env), true);
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', 'local only');
    assert.strictEqual(commit_on_remote_branch(work, git(work, 'rev-parse', 'HEAD'), 'main', env), false, 'not pushed');
    assert.strictEqual(commit_on_remote_branch(work, '--upload-pack=x', 'main', env), false, 'no option as a commit');
    assert.strictEqual(commit_on_remote_branch(work, pushed, '../x', env), false);
  });
});


suite('Branch libraries (spec 4.6)', () => {

  test('the answer of -a branch_libs: the last JSON line with a status', () => {
    assert.deepStrictEqual(parse_branch_libs_output('INFO some log\n{"version": 6, "status": "ok", "libs": []}\n'), { version: 6, status: 'ok', libs: [] });
    assert.strictEqual(parse_branch_libs_output('{"x": 1}\nno json'), undefined);
    assert.strictEqual(parse_branch_libs_output('{"status": "error", "message": "Not a branch library: #AAOBJ"}')?.message, 'Not a branch library: #AAOBJ');
  });

  test('library text of a branch (as the backend writes it) and the branch of a text', () => {
    assert.strictEqual(lib_text_of_branch('PROJ-337-order'), 'OBI PROJ-337-order');
    assert.strictEqual(lib_text_of_branch('proj-348--Translation-of-the-very-long-feature-name'), 'OBI proj-348--Translation-of-the-very-long-feature');
    assert.strictEqual(lib_text_of_branch('a b@c'), 'OBI a_b_c');
    assert.strictEqual(lib_text_of_branch('fix-😀'), 'OBI fix-_', 'one character, as in Python');
    assert.strictEqual(branch_for_text('OBI proj-348--Translation-of-the-very-long-feature', [], ['origin/proj-348--Translation-of-the-very-long-feature-name']), 'proj-348--Translation-of-the-very-long-feature-name', 'a cut text');
    assert.strictEqual(branch_for_text('OBI a_b', ['a b'], []), 'a b');
    assert.strictEqual(branch_for_text('my own text', ['x'], []), undefined);
  });

  test('state of a ticket: merged, upstream gone, active (also never pushed), no branch, unknown', () => {
    const facts = { local: true, remote: true, upstream_gone: false, merged: false };
    assert.strictEqual(ticket_state('OBI x', 'x', { ...facts, merged: true }), 'merged');
    assert.strictEqual(ticket_state('OBI x', 'x', { ...facts, remote: false, upstream_gone: true }), 'merged', 'squash merge, remote branch deleted');
    assert.strictEqual(ticket_state('OBI x', 'x', facts), 'active');
    assert.strictEqual(ticket_state('OBI x', 'x', { ...facts, remote: false }), 'active', 'never pushed: not merged');
    assert.strictEqual(ticket_state('OBI x', undefined, undefined), 'orphaned');
    assert.strictEqual(ticket_state('Library of Max', undefined, undefined), 'unknown', 'own crt-branch-lib text');
  });

  test('libraries grouped by ticket, with the newest last use', () => {
    const groups = group_by_ticket([
      { name: '#AA_337', ticket: '337', text: 'OBI PROJ-337-x', last_used: '2026-11-20' },
      { name: '#BB_337', ticket: '337', text: 'OBI PROJ-337-x', last_used: '2026-11-22' },
      { name: '#AA_338', ticket: '338', text: 'OBI PROJ-338-y', last_used: null },
    ]);
    assert.deepStrictEqual(groups.map(group => [group.ticket, group.text, group.libs.map(lib => lib.name), group.last_used]),
      [['337', 'OBI PROJ-337-x', ['#AA_337', '#BB_337'], '2026-11-22'], ['338', 'OBI PROJ-338-y', ['#AA_338'], undefined]]);
  });

  test('git: branches after fetch --prune, upstream gone, merged into origin/main', function () {
    if (!has_git())
      this.skip();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-branch-libs-'));
    try {
      const config = path.join(root, 'gitconfig');
      fs.writeFileSync(config, '');
      const env = git_env(config);
      const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
      const origin = path.join(root, 'origin.git');
      const work = path.join(root, 'work');
      git(root, 'init', '-q', '--bare', '-b', 'main', origin);
      git(root, 'clone', '-q', origin, work);
      const commit = (file: string) => { fs.writeFileSync(path.join(work, file), file); git(work, 'add', '-A'); git(work, 'commit', '-q', '-m', file); };
      commit('base');
      git(work, 'push', '-q', '-u', 'origin', 'main');
      for (const branch of ['PROJ-1-merged', 'PROJ-2-active', 'PROJ-3-gone']) {
        git(work, 'checkout', '-q', '-b', branch, 'main');
        commit(branch);
        git(work, 'push', '-q', '-u', 'origin', branch);
      }
      git(work, 'checkout', '-q', '-b', 'PROJ-4-local', 'main');
      commit('PROJ-4-local');
      git(work, 'checkout', '-q', 'main');
      git(work, 'merge', '-q', '--no-edit', 'PROJ-1-merged');
      git(work, 'push', '-q', 'origin', 'main');
      git(work, 'push', '-q', 'origin', '--delete', 'PROJ-3-gone');
      // As on another machine: the deleted branch is still known until fetch --prune
      git(work, 'fetch', '-q', 'origin', '+refs/heads/*:refs/remotes/origin/*');

      const branches = list_branches(work, env);
      assert.ok(branches);
      assert.deepStrictEqual(branches.local.sort(), ['PROJ-1-merged', 'PROJ-2-active', 'PROJ-3-gone', 'PROJ-4-local', 'main']);
      assert.deepStrictEqual(branches.gone, ['PROJ-3-gone']);
      assert.deepStrictEqual(branches.remote.sort(), ['origin/PROJ-1-merged', 'origin/PROJ-2-active', 'origin/main']);
      assert.strictEqual(is_merged_into(work, 'PROJ-1-merged', 'main', true, env), true);
      assert.strictEqual(is_merged_into(work, 'PROJ-2-active', 'main', true, env), false);
      assert.strictEqual(is_merged_into(work, 'PROJ-2-active', 'main', false, env), false, 'only origin/<branch>');
      assert.strictEqual(is_merged_into(work, '--x', 'main', true, env), false);
      assert.strictEqual(list_branches(root, env), undefined, 'not a repository');
    }
    finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
