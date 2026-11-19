import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PACKAGE_LAST_BUILDS_FILE, PackageLastBuilds, last_build_of } from '../../extension/obi/PackageLastBuilds';
import { BuildPackageStore } from '../../extension/obi/BuildPackageStore';


const ok = { cmd: 'x', status: 'success' };
const failed = { cmd: 'x', status: 'failed' };
const open = { cmd: 'x', status: 'new' };

const list = (sources: { cmds: object[]; ignore?: boolean }[], name: string | null = 'ABC-123') => ({
  timestamp: '2026-11-19T10:31:00.000Z',
  ...(name !== null ? { package: { name } } : {}),
  compiles: [{ level: 1, sources: sources.map((source, i) => ({ source: `lib/q/s${i}.pgm`, ...source })) }]
});

const DIR = '2026-11-19T10.31.00.000Z';


suite('Last build of build packages', () => {

  const created: string[] = [];
  const workspace = () => { const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-last-build-')); created.push(ws); return ws; };
  teardown(() => created.splice(0).forEach(ws => fs.rmSync(ws, { recursive: true, force: true })));


  test('status of a package build: success, failed, incomplete (cancelled); ignored sources don\'t count', () => {
    assert.deepStrictEqual(last_build_of(DIR, list([{ cmds: [ok] }, { cmds: [failed], ignore: true }])), {
      name: 'ABC-123',
      build: { status: 'success', timestamp: '2026-11-19T10:31:00.000Z', history: DIR, total: 1, failed: 0, not_run: 0 }
    });
    assert.strictEqual(last_build_of(DIR, list([{ cmds: [ok] }, { cmds: [ok, failed] }, { cmds: [open] }]))?.build.status, 'failed');
    assert.deepStrictEqual(last_build_of(DIR, list([{ cmds: [ok] }, { cmds: [open] }]))?.build,
      { status: 'incomplete', timestamp: '2026-11-19T10:31:00.000Z', history: DIR, total: 2, failed: 0, not_run: 1 });
  });


  test('builds that are no package builds are not recorded', () => {
    assert.strictEqual(last_build_of(DIR, list([{ cmds: [ok] }], null)), undefined);
    assert.strictEqual(last_build_of(DIR, list([{ cmds: [ok] }], '../x')), undefined);
    assert.strictEqual(last_build_of(DIR, null), undefined);
    assert.strictEqual(new PackageLastBuilds(workspace()).record(DIR, list([], null)), undefined);
  });


  test('record, read; an older build doesn\'t replace a newer one', () => {
    const ws = workspace();
    const store = new PackageLastBuilds(ws);
    assert.strictEqual(store.get('ABC-123'), undefined);

    assert.strictEqual(store.record(DIR, list([{ cmds: [failed] }])), 'ABC-123');
    assert.strictEqual(store.get('ABC-123')?.status, 'failed');
    assert.ok(fs.existsSync(path.join(ws, PACKAGE_LAST_BUILDS_FILE)));

    store.record('2026-11-19T11.00.00.000Z', list([{ cmds: [ok] }]));
    assert.strictEqual(store.get('ABC-123')?.history, '2026-11-19T11.00.00.000Z');
    store.record('2026-11-18T09.00.00.000Z', list([{ cmds: [failed] }]));
    assert.strictEqual(store.get('ABC-123')?.history, '2026-11-19T11.00.00.000Z', 'the newest stays');
  });


  test('a broken or foreign cache file counts as empty', () => {
    const ws = workspace();
    const store = new PackageLastBuilds(ws);
    fs.mkdirSync(path.dirname(store.file()), { recursive: true });
    fs.writeFileSync(store.file(), '{');
    assert.deepStrictEqual(store.all(), {});
    fs.writeFileSync(store.file(), JSON.stringify({ 'ABC-123': { status: 'success' }, '../x': {}, other: 'x' }));
    assert.deepStrictEqual(store.all(), {});
    store.record(DIR, list([{ cmds: [ok] }]));
    assert.deepStrictEqual(Object.keys(store.all()), ['ABC-123']);
  });


  test('the build summary exists only while the build is in the build history', () => {
    const ws = workspace();
    const store = new PackageLastBuilds(ws);
    store.record(DIR, list([{ cmds: [ok] }]));
    const build = store.get('ABC-123')!;
    assert.ok(!store.summary_exists(build));
    fs.mkdirSync(path.join(ws, '.obi/build-history', DIR), { recursive: true });
    fs.writeFileSync(path.join(ws, '.obi/build-history', DIR, 'compile-list.json'), '{}');
    assert.ok(store.summary_exists(build));
    assert.ok(!store.summary_exists({ ...build, history: '..' }));
    assert.ok(!store.summary_exists({ ...build, history: `../${DIR}` }));
  });


  test('renaming a package keeps its last build, deleting it removes it', () => {
    const ws = workspace();
    const packages = new BuildPackageStore(ws);
    const last_builds = new PackageLastBuilds(ws);
    packages.create('ABC-123');
    packages.create('other');
    last_builds.record(DIR, list([{ cmds: [ok] }]));
    last_builds.record(DIR, list([{ cmds: [failed] }], 'other'));

    packages.rename('ABC-123', 'ABC-124');
    assert.strictEqual(last_builds.get('ABC-123'), undefined);
    assert.strictEqual(last_builds.get('ABC-124')?.status, 'success');

    packages.delete('other');
    assert.deepStrictEqual(Object.keys(last_builds.all()), ['ABC-124']);
  });
});
