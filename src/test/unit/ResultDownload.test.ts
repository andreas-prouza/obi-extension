import assert from 'assert';
import { PhaseTimer, result_download_plan, source_output_dir, ssh_concurrency } from '../../extension/obi/ResultDownload';


suite('Build result download', () => {

  test('only the files of the built sources', () => {
    const compile_list = {
      compiles: [
        { level: 1, sources: [
          { source: 'lib/qrpglesrc/a.rpgle.pgm', cmds: [{ status: 'success' }] },
          { source: 'lib/qclsrc/b.clle.pgm', cmds: [{ status: 'new' }] }
        ] },
        { level: 2, sources: [{ source: 'lib/qrpglesrc/a.rpgle.pgm', cmds: [{ status: 'failed' }] }] }
      ]
    };

    assert.deepStrictEqual(result_download_plan(compile_list, { 'build-output-dir': '.obi/build-output/objects', 'evfevent-output-dir': '.obi/tmp/evfevent' }), {
      flat_dirs: ['.obi/build-output', '.obi/tmp'],
      dirs: ['.obi/log'],
      optional: {
        dirs: ['.obi/build-output/objects/lib/a.rpgle.pgm'],
        files: ['.obi/tmp/evfevent/lib/qrpglesrc/a.rpgle.pgm', '.obi/tmp/evfevent/lib/qclsrc/b.clle.pgm']
      }
    });
  });


  test('sources and folders from the IBM i never point outside the project folder', () => {
    const plan = result_download_plan(
      { compiles: [{ sources: [{ source: '../../etc/passwd', cmds: [{ status: 'success' }] }, { source: 42 }] }] },
      { 'build-output-dir': '../outside', 'evfevent-output-dir': '/abs' });
    assert.deepStrictEqual(plan.optional, { dirs: [], files: [] });

    const defaults = result_download_plan({ compiles: [{ sources: [{ source: 'l/f/m.pgm', cmds: [{ status: 'success' }] }] }] }, { 'build-output-dir': '../outside', 'evfevent-output-dir': 'out\\evf/' });
    assert.deepStrictEqual(defaults.optional.dirs, ['.obi/build-output/l/m.pgm']);
    assert.deepStrictEqual(defaults.optional.files, ['out/evf/l/f/m.pgm']);
  });


  test('output folder of a source as the Python OBI writes it', () => {
    assert.strictEqual(source_output_dir('.obi/build-output', 'prouzalib/qrpglesrc/hello.rpgle.pgm'), '.obi/build-output/prouzalib/hello.rpgle.pgm');
  });


  test('ssh-concurrency is clamped to 1–32', () => {
    assert.strictEqual(ssh_concurrency(undefined), 5);
    assert.strictEqual(ssh_concurrency('abc'), 5);
    assert.strictEqual(ssh_concurrency(0), 1);
    assert.strictEqual(ssh_concurrency(100), 32);
    assert.strictEqual(ssh_concurrency('8'), 8);
  });


  test('phase timings', async () => {
    let now = 0;
    const timer = new PhaseTimer(() => now);
    await timer.run('upload', async () => { now += 2000; });
    await assert.rejects(timer.run('remote run', async () => { now += 151000; throw new Error('x'); }));
    now += 500;
    assert.strictEqual(timer.summary(), 'upload 0:02 · remote run 2:31 · total 2:33');
  });
});
