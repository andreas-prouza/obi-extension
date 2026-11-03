import assert from 'assert';
import { render_status, summarize_build } from '../../extension/utilities/StatusText';


const at_10_42 = new Date(2026, 9, 23, 10, 42).toISOString();


suite('Status bar text', () => {

  test('idle without build, after a good and after a failed build', () => {
    assert.strictEqual(render_status({ profile: 'prod', connection: 'MAX@ibmi' }).text, '$(server-environment) prod');
    assert.match(render_status({ profile: 'prod', connection: 'MAX@ibmi', remote_dir: '~/proj' }).tooltip, /MAX@ibmi · `~\/proj`/);

    const ok = render_status({ profile: 'prod', last_build: { time: at_10_42, total: 12, failed: 0 } });
    assert.strictEqual(ok.text, '$(server-environment) prod  $(check) 10:42');
    assert.match(ok.tooltip, /Last build 10:42: 12 sources, all successful/);

    const failed = render_status({ profile: 'prod', last_build: { time: at_10_42, total: 12, failed: 2 } });
    assert.strictEqual(failed.text, '$(server-environment) prod  $(error) 2 failed');
    assert.match(failed.tooltip, /2 of 12 sources failed/);
  });


  test('running and cancelled', () => {
    const running = render_status({ profile: 'prod', running: { label: 'Run build', elapsed_ms: 65_000 } });
    assert.strictEqual(running.text, '$(sync~spin) Run build…');
    assert.match(running.tooltip, /Run build · 1:05/);
    assert.strictEqual(render_status({ profile: 'prod', cancelled: true }).text, '$(circle-slash) Cancelled');
  });


  test('build result from the compile list (ignored sources and commands don\'t count)', () => {
    const summary = summarize_build({
      compiles: [
        { sources: [{ cmds: [{ status: 'success' }] }, { cmds: [{ status: 'failed' }] }, { ignore: true, cmds: [{ status: 'new' }] }] },
        { sources: [{ cmds: [{ status: 'success' }, { status: 'new', ignore: true }] }] },
      ]
    });
    assert.deepStrictEqual([summary.total, summary.failed], [3, 1]);
  });
});
