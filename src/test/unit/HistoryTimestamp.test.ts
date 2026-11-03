import assert from 'assert';
import { history_dir_name, parse_history_dir, local_date_label } from '../../webview/build_history/HistoryTimestamp';

// Time zone dependent expectations: run with a fixed zone (Europe/Vienna: UTC+2 in summer, +1 in winter)
const ORIGINAL_TZ = process.env.TZ;


suite('Build history timestamps', () => {

  suiteSetup(() => { process.env.TZ = 'Europe/Vienna'; });
  suiteTeardown(() => { if (ORIGINAL_TZ === undefined) delete process.env.TZ; else process.env.TZ = ORIGINAL_TZ; });


  test('ISO timestamps with Z (TypeScript build list) round-trip', () => {
    const dir = history_dir_name('2026-10-22T12:05:01.123Z');
    assert.strictEqual(dir, '2026-10-22T12.05.01.123Z');
    assert.strictEqual(parse_history_dir(dir)?.toISOString(), '2026-10-22T12:05:01.123Z');
  });


  test('local timestamps without zone (Python OBI) are local time', () => {
    const date = parse_history_dir(history_dir_name('2026-08-14T19:48:46.664582'));
    assert.ok(date);
    assert.strictEqual(date.getHours(), 19);
    assert.strictEqual(date.getMilliseconds(), 664);
    assert.strictEqual(local_date_label(date), '2026-08-14');
  });


  test('space separator and zone offsets are accepted', () => {
    assert.strictEqual(parse_history_dir('2026-08-14_19.48.46')?.getMinutes(), 48);
    assert.strictEqual(parse_history_dir('2026-10-22T12.05.01+02.00')?.toISOString(), '2026-10-22T10:05:01.000Z');
    assert.strictEqual(parse_history_dir('2026-10-22T12.05.01+0200')?.toISOString(), '2026-10-22T10:05:01.000Z');
  });


  test('local date label: 23:30 UTC on Oct 22 is Oct 23 in Vienna', () => {
    const date = parse_history_dir(history_dir_name('2026-10-22T23:30:00.000Z'));
    assert.ok(date);
    assert.strictEqual(local_date_label(date), '2026-10-23');
  });


  test('folders that are not timestamps give undefined', () => {
    for (const dir of ['garbage', '2026-10-22', '.DS_Store', '2026-13-40T99.99.99'])
      assert.strictEqual(parse_history_dir(dir), undefined, dir);
  });


  test('sorting by date is chronological, independent of locale formats', () => {
    const dirs = ['2026-10-22T10.00.00', '2026-10-22T09.05.00', '2026-10-22T13.00.00'];
    const sorted = [...dirs].sort((a, b) => (parse_history_dir(b)?.getTime() ?? 0) - (parse_history_dir(a)?.getTime() ?? 0));
    assert.deepStrictEqual(sorted, ['2026-10-22T13.00.00', '2026-10-22T10.00.00', '2026-10-22T09.05.00']);
  });
});
