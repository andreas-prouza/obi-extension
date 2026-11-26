import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BuildHistoryProvider, BuildHistoryItem } from '../../webview/build_history/BuildHistoryProvider';
import { Constants } from '../../shared/Constants';
import { history_dir_name, local_date_label, parse_history_dir } from '../../shared/HistoryTimestamp';


/** Workspace-like folder with build history entries for the given compile-list timestamps. */
function history_root(timestamps: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-history-'));
  for (const timestamp of timestamps) {
    const dir = path.join(root, Constants.BUILD_HISTORY_DIR, history_dir_name(timestamp));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'compile-list.json'), JSON.stringify({ timestamp, compiles: [] }));
  }
  fs.mkdirSync(path.join(root, Constants.BUILD_HISTORY_DIR, 'not-a-timestamp'), { recursive: true });
  return root;
}


suite('Build history tree', () => {

  test('builds with and without zone appear, newest first; other folders are ignored', async () => {
    // TypeScript build list (UTC, "Z") and Python OBI (local time) on the same local day
    const utc = '2026-10-22T08:00:00.000Z';
    const local = '2026-10-22T13:30:00.000000';
    const root = history_root([utc, local]);
    try {
      const provider = new BuildHistoryProvider(root);
      const day = local_date_label(parse_history_dir(history_dir_name(utc))!);
      const dates = await provider.getChildren();
      const date_item = dates.find(item => item.date === day);
      assert.ok(date_item, `date group ${day} exists`);

      const builds: BuildHistoryItem[] = await provider.getChildren(date_item);
      assert.strictEqual(builds.length, 2, 'both timestamp formats are shown');
      assert.ok((builds[0].build_time?.getTime() ?? 0) > (builds[1].build_time?.getTime() ?? 0), 'newest first');
    }
    finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });


  test('filter by build package: only the builds of the package, with its name next to the time', async () => {
    const root = history_root([]);
    const add = (timestamp: string, build_package?: string) => {
      const dir = path.join(root, Constants.BUILD_HISTORY_DIR, history_dir_name(timestamp));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'compile-list.json'), JSON.stringify({ timestamp, compiles: [], ...(build_package ? { package: { name: build_package } } : {}) }));
    };
    add('2026-10-22T08:00:00.000Z', 'ABC-123');
    add('2026-10-22T09:00:00.000Z', 'other');
    add('2026-10-22T10:00:00.000Z');
    try {
      const provider = new BuildHistoryProvider(root);
      const builds = async () => (await Promise.all((await provider.getChildren()).map(date => provider.getChildren(date)))).flat();

      assert.strictEqual((await builds()).length, 3);
      await provider.set_package_filter('ABC-123');
      const filtered = await builds();
      assert.deepStrictEqual(filtered.map(item => item.dirName), [history_dir_name('2026-10-22T08:00:00.000Z')]);
      assert.strictEqual(filtered[0].description, 'ABC-123');

      await provider.set_package_filter(undefined);
      assert.strictEqual((await builds()).length, 3);
    }
    finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
