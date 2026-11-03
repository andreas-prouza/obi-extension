import assert from 'assert';
import { HistoryEntry, format_size, select_expired } from '../../webview/build_history/HistoryRetention';


const now = new Date('2026-10-24T12:00:00Z');
const days_ago = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

// Not sorted, as read from the folder
const entries: HistoryEntry[] = [
  { dir: 'd3', date: days_ago(3) },
  { dir: 'd0', date: days_ago(0) },
  { dir: 'not-a-date', date: undefined },
  { dir: 'd10', date: days_ago(10) },
  { dir: 'd1', date: days_ago(1) },
];


suite('Build history retention', () => {

  test('max builds keeps the newest', () => {
    assert.deepStrictEqual(select_expired(entries, { max_builds: 2, max_age_days: 0 }, now), ['d3', 'd10']);
  });

  test('max age drops older builds', () => {
    assert.deepStrictEqual(select_expired(entries, { max_builds: 0, max_age_days: 7 }, now), ['d10']);
  });

  test('both combined', () => {
    assert.deepStrictEqual(select_expired(entries, { max_builds: 3, max_age_days: 2 }, now), ['d3', 'd10']);
  });

  test('0 (or invalid values) means unlimited; undated folders are kept', () => {
    assert.deepStrictEqual(select_expired(entries, { max_builds: 0, max_age_days: 0 }, now), []);
    assert.deepStrictEqual(select_expired(entries, { max_builds: -1, max_age_days: NaN }, now), []);
    assert.ok(!select_expired(entries, { max_builds: 1, max_age_days: 1 }, now).includes('not-a-date'));
  });

  test('the new build is never selected', () => {
    // e.g. a build with a wrong clock: older than the others
    const with_old_new_build = [...entries, { dir: 'new', date: days_ago(30) }];
    assert.ok(!select_expired(with_old_new_build, { max_builds: 1, max_age_days: 7 }, now, 'new').includes('new'));
  });

  test('size format', () => {
    assert.strictEqual(format_size(100), '1 KB');
    assert.strictEqual(format_size(5 * 1024 * 1024), '5 MB');
    assert.strictEqual(format_size(1.5 * 1024 * 1024 * 1024), '1.5 GB');
  });
});
