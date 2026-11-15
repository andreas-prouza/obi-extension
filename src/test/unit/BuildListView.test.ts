import assert from 'assert';
import { annotate_build_list, is_failed_status, source_status } from '../../shared/BuildListView';


suite('Build list view', () => {

  test('source_status: the last command that ran, else the first one', () => {
    assert.strictEqual(source_status([{ status: 'success' }, { status: 'failed' }, { status: 'new' }]), 'failed');
    assert.strictEqual(source_status([{ status: 'success' }, { status: 'new' }]), 'success');
    assert.strictEqual(source_status([{ status: 'new' }, { status: 'new' }]), 'new');
    assert.strictEqual(source_status([{ status: 'in process' }]), 'in process');
    assert.strictEqual(source_status([]), 'new');
    assert.strictEqual(source_status(undefined), 'new');
    assert.strictEqual(source_status([null, { status: 3 }, { status: 'success' }]), 'success');
  });


  test('is_failed_status', () => {
    assert.deepStrictEqual(['failed', 'error', 'success', 'new'].map(is_failed_status), [true, true, false, false]);
  });


  test('annotate_build_list: status per source, counts per level and in total', () => {
    const list = { compiles: [
      { level: 1, sources: [{ source: 'a', cmds: [{ status: 'success' }] }] },
      { level: 2, sources: [{ source: 'b', cmds: [{ status: 'success' }, { status: 'failed' }] }, { source: 'c', cmds: [{ status: 'new' }] }, 'x'] },
      null,
    ] };
    const totals = annotate_build_list(list);
    assert.deepStrictEqual(totals, { total: 3, success: 1, failed: 1, open: 1, levels: 2 });
    assert.deepStrictEqual(list.compiles[1]?.sources.map(source => typeof source === 'object' ? source['view_status' as keyof typeof source] : source), ['failed', 'new', 'x']);
    assert.deepStrictEqual((list.compiles[1] as Record<string, unknown>)['view_counts'], { total: 2, success: 0, failed: 1, open: 1 });
    assert.deepStrictEqual(annotate_build_list(undefined), { total: 0, success: 0, failed: 0, open: 0, levels: 0 });
  });
});
