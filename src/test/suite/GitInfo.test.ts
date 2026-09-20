import * as fs from 'fs-extra';
import * as path from 'path';
import assert from 'assert';
import { Workspace } from '../../extension/utilities/Workspace';
import { GitInfo } from '../../extension/utilities/GitInfo';


suite('GitInfo', () => {

    const ws = Workspace.get_workspace();

    setup(async () => {
        await fs.emptyDir(ws);
    });


    test('No .git directory -> undefined', () => {
        assert.strictEqual(GitInfo.get_git_info(ws), undefined);
    });


    test('Branch HEAD with loose ref -> branch + commit', () => {
        const commit = 'a'.repeat(40);
        fs.mkdirpSync(path.join(ws, '.git', 'refs', 'heads'));
        fs.writeFileSync(path.join(ws, '.git', 'HEAD'), 'ref: refs/heads/feature-x\n');
        fs.writeFileSync(path.join(ws, '.git', 'refs', 'heads', 'feature-x'), `${commit}\n`);

        const info = GitInfo.get_git_info(ws);
        assert.strictEqual(info?.branch, 'feature-x');
        assert.strictEqual(info?.commit, commit);
    });


    test('Branch HEAD resolved via packed-refs when loose ref is missing', () => {
        const commit = 'b'.repeat(40);
        fs.mkdirpSync(path.join(ws, '.git'));
        fs.writeFileSync(path.join(ws, '.git', 'HEAD'), 'ref: refs/heads/main\n');
        fs.writeFileSync(path.join(ws, '.git', 'packed-refs'), `${commit} refs/heads/main\n`);

        const info = GitInfo.get_git_info(ws);
        assert.strictEqual(info?.branch, 'main');
        assert.strictEqual(info?.commit, commit);
    });


    test('Detached HEAD -> commit only, no branch', () => {
        const commit = 'c'.repeat(40);
        fs.mkdirpSync(path.join(ws, '.git'));
        fs.writeFileSync(path.join(ws, '.git', 'HEAD'), `${commit}\n`);

        const info = GitInfo.get_git_info(ws);
        assert.strictEqual(info?.branch, undefined);
        assert.strictEqual(info?.commit, commit);
    });


    test('attach_git_info removes stale git key when not a git project', () => {
        const compileList: Record<string, unknown> = { git: { branch: 'stale' } };
        GitInfo.attach_git_info(compileList, ws);
        assert.strictEqual(compileList.git, undefined);
    });


    test('attach_git_info sets git key when a git project', () => {
        const commit = 'd'.repeat(40);
        fs.mkdirpSync(path.join(ws, '.git', 'refs', 'heads'));
        fs.writeFileSync(path.join(ws, '.git', 'HEAD'), 'ref: refs/heads/develop\n');
        fs.writeFileSync(path.join(ws, '.git', 'refs', 'heads', 'develop'), `${commit}\n`);

        const compileList: Record<string, unknown> = {};
        GitInfo.attach_git_info(compileList, ws);
        const git = compileList.git as { branch?: string; commit?: string };
        assert.strictEqual(git.branch, 'develop');
        assert.strictEqual(git.commit, commit);
    });
});
