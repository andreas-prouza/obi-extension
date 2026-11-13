import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BuildEntry, builds_below_folder, builds_for_source, item_id, page, parse_item_id, read_build } from '../../webview/build_history/HistoryIndex';
import { BuildIndex } from '../../webview/build_history/BuildIndex';
import { source_status } from '../../shared/BuildStatus';
import { summarize_build } from '../../extension/utilities/StatusText';
import { version_at_least } from '../../shared/Version';


const ok = (cmd = 'CRTPGM') => ({ cmd, status: 'success' });
const failed = (cmd = 'CRTPGM') => ({ cmd, status: 'failed' });
const not_run = (cmd = 'CRTPGM') => ({ cmd, status: 'new' });

/** Fixture build list: one level per array */
function compile_list(...levels: { source: string; cmds?: { cmd?: string; status?: string; ignore?: boolean }[]; ignore?: boolean; hash?: string }[][]) {
  return { compiles: levels.map(sources => ({ level: 1, sources })) };
}

function entry(dir: string, ...sources: [string, 'success' | 'failed'][]): BuildEntry {
  const build = read_build(dir, compile_list(sources.map(([source, status]) => ({ source, cmds: [status === 'success' ? ok() : failed()] }))));
  assert.ok(build, `fixture ${dir}`);
  return build;
}


suite('Build history index', () => {

  test('VS Code version compare', () => {
    assert.ok(!version_at_least('1.90.0', '1.145.0'));
    assert.ok(!version_at_least('1.144.1', '1.145.0'));
    assert.ok(version_at_least('1.145.0', '1.145.0'));
    assert.ok(version_at_least('1.145.0-insider', '1.145.0'));
    assert.ok(version_at_least('1.200.1', '1.145.0'));
    assert.ok(version_at_least('2.0.0', '1.145.0'));
    assert.ok(!version_at_least('unknown', '1.145.0'));
  });

  test('source status: success, failed, not run, ignored', () => {
    assert.strictEqual(source_status({ cmds: [ok(), ok()] }), 'success');
    assert.strictEqual(source_status({ cmds: [] }), 'success');
    assert.strictEqual(source_status({ cmds: [ok(), failed(), not_run()] }), 'failed');
    assert.strictEqual(source_status({ cmds: [ok(), not_run()] }), 'not-run');
    assert.strictEqual(source_status({ cmds: [ok(), { ...failed(), ignore: true }] }), 'success');
    assert.strictEqual(source_status({ ignore: true, cmds: [failed()] }), 'ignored');
  });

  test('read_build counts like the status bar', () => {
    const list = compile_list(
      [{ source: 'lib/qrpglesrc/a.rpgle', cmds: [ok()], hash: 'h1' }, { source: 'lib/qrpglesrc/b.rpgle', cmds: [failed()] }],
      [{ source: 'lib/qclsrc/c.clle', cmds: [ok(), not_run()] }, { source: 'lib/qclsrc/d.clle', ignore: true, cmds: [not_run()] }],
    );
    const build = read_build('2026-11-07T10.00.00.000Z', list);
    assert.ok(build);
    assert.strictEqual(build.time.toISOString(), '2026-11-07T10:00:00.000Z');
    assert.deepStrictEqual([build.total, build.failed], [3, 2]);
    const summary = summarize_build(list);
    assert.deepStrictEqual([summary.total, summary.failed], [build.total, build.failed]);
    assert.strictEqual(build.sources.get('lib/qrpglesrc/a.rpgle')?.hash, 'h1');
    assert.strictEqual(build.sources.get('lib/qclsrc/c.clle')?.status, 'not-run');
    assert.strictEqual(build.sources.get('lib/qclsrc/d.clle')?.status, 'ignored');
  });

  test('read_build: broken lists and folder names', () => {
    assert.strictEqual(read_build('not-a-timestamp', compile_list([{ source: 'a' }])), undefined);
    assert.strictEqual(read_build('2026-11-07T10.00.00.000Z', {}), undefined);
    assert.strictEqual(read_build('2026-11-07T10.00.00.000Z', null), undefined);
    const build = read_build('2026-11-07T10.00.00.000Z', { compiles: [null, { sources: 'x' }, { sources: [{ source: 42 }, null, { source: 'lib/f/a.pgm', cmds: [null, 'x', ok()] as unknown[] }] }] });
    assert.ok(build);
    assert.deepStrictEqual([...build.sources.keys()], ['lib/f/a.pgm']);
    assert.strictEqual(build.sources.get('lib/f/a.pgm')?.cmds.length, 1);
  });

  test('read_build: the i-Releaser deployment of the build', () => {
    const dir = '2026-11-07T10.00.00.000Z';
    assert.strictEqual(read_build(dir, compile_list([{ source: 'a', cmds: [ok()] }]))?.deployment, undefined);
    assert.strictEqual(read_build(dir, { ...compile_list([{ source: 'a', cmds: [ok()] }]), custom_data: { 'i-releaser': { id: 123, workflow: 'wf' } } })?.deployment, '123');
    // Stored by a custom build summary template
    assert.strictEqual(read_build(dir, { ...compile_list([]), custom_data: { json: { meta_file: { general: { id: 'x7' } } } } })?.deployment, 'x7');
  });

  test('builds of a source and below a folder, newest first', () => {
    const index = [
      entry('2026-11-05T10.00.00.000Z', ['lib/qrpglesrc/a.rpgle', 'success']),
      entry('2026-11-07T10.00.00.000Z', ['lib/qrpglesrc/a.rpgle', 'failed'], ['lib/qrpglesrc2/x.rpgle', 'success']),
      entry('2026-11-06T10.00.00.000Z', ['lib/qrpglesrc2/x.rpgle', 'failed']),
    ];
    assert.deepStrictEqual(builds_for_source(index, 'lib/qrpglesrc/a.rpgle').map(build => build.dir), ['2026-11-07T10.00.00.000Z', '2026-11-05T10.00.00.000Z']);

    // Whole path segments: qrpglesrc doesn't match qrpglesrc2
    const folder = builds_below_folder(index, 'lib/qrpglesrc');
    assert.deepStrictEqual(folder.map(build => [build.entry.dir, build.total, build.failed]), [['2026-11-07T10.00.00.000Z', 1, 1], ['2026-11-05T10.00.00.000Z', 1, 0]]);
    assert.strictEqual(builds_below_folder(index, 'lib/').length, 3);
    assert.strictEqual(builds_below_folder(index, '').length, 3);
  });

  test('paging', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    assert.deepStrictEqual(page(items, undefined, 2), { items: ['a', 'b'], cursor: '2' });
    assert.deepStrictEqual(page(items, '2', 2), { items: ['c', 'd'], cursor: '4' });
    assert.deepStrictEqual(page(items, '4', 2), { items: ['e'] });
    assert.deepStrictEqual(page(items, 'nonsense', 2), { items: ['a', 'b'], cursor: '2' });
    assert.deepStrictEqual(page(items, '99', undefined), { items });
    assert.deepStrictEqual(page(items, undefined, undefined), { items });
  });

  test('item ids', () => {
    assert.deepStrictEqual(parse_item_id(item_id('2026-11-07T10.00.00.000Z', 'lib/f/a.pgm')), { dir: '2026-11-07T10.00.00.000Z', path: 'lib/f/a.pgm' });
    assert.deepStrictEqual(parse_item_id(item_id('2026-11-07T10.00.00.000Z')), { dir: '2026-11-07T10.00.00.000Z' });
    assert.deepStrictEqual(parse_item_id(item_id('2026-11-07T10.00.00.000Z', '')), { dir: '2026-11-07T10.00.00.000Z', path: '' });
  });

  test('BuildIndex reads each compile list once per change and forgets deleted builds', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-index-'));
    try {
      const write = (dir: string, list: unknown) => {
        fs.mkdirSync(path.join(root, dir), { recursive: true });
        fs.writeFileSync(path.join(root, dir, 'compile-list.json'), JSON.stringify(list));
      };
      write('2026-11-06T10.00.00.000Z', compile_list([{ source: 'lib/f/a.pgm', cmds: [ok()] }]));
      write('2026-11-07T10.00.00.000Z', compile_list([{ source: 'lib/f/a.pgm', cmds: [failed()] }]));
      write('not-a-timestamp', compile_list([]));
      fs.mkdirSync(path.join(root, '2026-11-08T10.00.00.000Z'));   // without compile-list.json
      fs.writeFileSync(path.join(root, 'stray-file'), '');

      const first = BuildIndex.list(root);
      assert.deepStrictEqual(first.map(build => build.dir), ['2026-11-07T10.00.00.000Z', '2026-11-06T10.00.00.000Z']);
      assert.strictEqual(BuildIndex.list(root)[0], first[0], 'cached object while unchanged');

      write('2026-11-07T10.00.00.000Z', compile_list([{ source: 'lib/f/a.pgm', cmds: [ok(), ok()] }]));
      assert.strictEqual(BuildIndex.list(root)[0].sources.get('lib/f/a.pgm')?.status, 'success', 'changed file is read again');

      fs.rmSync(path.join(root, '2026-11-07T10.00.00.000Z'), { recursive: true });
      assert.deepStrictEqual(BuildIndex.list(root).map(build => build.dir), ['2026-11-06T10.00.00.000Z']);

      assert.deepStrictEqual(BuildIndex.list(root, { isCancellationRequested: true }), []);
      assert.deepStrictEqual(BuildIndex.list(path.join(root, 'missing')), []);
    }
    finally {
      fs.rmSync(root, { recursive: true, force: true });
      BuildIndex.reset();
    }
  });

  test('BuildIndex listeners', () => {
    let calls = 0;
    const subscription = BuildIndex.on_changed(() => calls++);
    BuildIndex.on_changed(() => { throw new Error('broken view'); }).dispose();
    const broken = BuildIndex.on_changed(() => { throw new Error('broken view'); });
    BuildIndex.changed();
    subscription.dispose();
    broken.dispose();
    BuildIndex.changed();
    assert.strictEqual(calls, 1);
  });
});
