# Build history timestamps are parsed inconsistently

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟠 | finished | [reliability.md R9](../improvements/reliability.md#r9--build-history-timestamps-are-parsed-inconsistently) | – |

Also fixes [bugs.md #17](../bugs.md#17--build-history-delete-by-date-may-miss-builds-around-midnight).


# Current situation

The history folder name is derived from the compile-list `timestamp` ([OBICommands.ts:224-230](../../src/extension/obi/OBICommands.ts#L224-L230)):

```ts
public static date2escaped_date(date: string): string { return date.replace(/:/g, ".").replace(" ", "_"); }
```

Two timestamp formats occur:
* the TypeScript build list writes `new Date().toISOString()` ([dependency.ts:59](../../src/extension/obi/compile_list/modules/dependency.ts#L59)), e.g. `2026-10-22T12:05:01.123Z` (UTC);
* the Python OBI writes local time without a zone, e.g. `2026-08-14T19:48:46.664582`.

`escaped_date2date` ([BuildHistoryProvider.ts:35-42](../../src/webview/build_history/BuildHistoryProvider.ts#L35-L42)) only handles the second form. Verified with Node (`TZ=Europe/Vienna`):

| Folder | Result of `escaped_date2date` |
|---|---|
| `2026-10-22T12.05.01.123Z` | **Invalid Date** (the `:ms` → `.ms` regex needs digits at the end; `substring(0, 23)` drops the `Z`) |
| `2026-08-14T19.48.46.664582` | `2026-08-14 19:48:46` local ✓ |

Consequences:
* Builds with a `Z` timestamp are skipped in the date view (`toISOString()` on an invalid date throws; the date grouping catches it and logs "Invalid date format").
* When a date node is expanded, the same conversion runs in a `map` **without** `try` ([BuildHistoryProvider.ts:85-110](../../src/webview/build_history/BuildHistoryProvider.ts#L85-L110)), so one such folder makes the whole date node fail. The same applies to the source view ([BuildHistoryProvider.ts:255-272](../../src/webview/build_history/BuildHistoryProvider.ts#L255-L272)) and `reveal_build`.
* *Delete by date* compares the **UTC** date ([BuildHistoryProvider.ts:527-529](../../src/webview/build_history/BuildHistoryProvider.ts#L527-L529)), while the labels use the local date → builds between local midnight and the UTC offset are not deleted (bugs.md #17).
* Builds of one day are sorted by `localeCompare` of `toLocaleTimeString()` ([BuildHistoryProvider.ts:111-118](../../src/webview/build_history/BuildHistoryProvider.ts#L111-L118)). In 12-hour locales `9:05:00 AM` sorts after `10:00:00 AM`.


# Fix

## 1. One parser, one label function

In `BuildHistoryProvider` (or a small `HistoryTimestamp.ts`):

```ts
const HISTORY_DIR = /^(\d{4}-\d{2}-\d{2})[T_ ](\d{2})\.(\d{2})\.(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}\.?\d{2})?$/;

/** Folder name → Date. Timestamps without zone are local time (Python OBI), with zone as given. */
public static parse_history_dir(dir: string): Date | undefined {
  const m = HISTORY_DIR.exec(dir);
  if (!m) return undefined;
  const [, day, h, min, s, frac = '0', zone = ''] = m;
  const ms = frac.padEnd(3, '0').substring(0, 3);
  const iso_zone = zone.replace('.', ':');      // "+01.00" → "+01:00"
  const date = new Date(`${day}T${h}:${min}:${s}.${ms}${iso_zone}`);
  return isNaN(date.getTime()) ? undefined : date;
}

/** Local calendar date used for grouping and for "delete by date". */
public static local_date_label(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
```

* Keep `date2escaped_date` for writing (it already keeps the `Z`). The colon replacement stays, because Windows doesn't allow `:` in folder names.
* Remove `escaped_date2date` and the `tzOffset` arithmetic everywhere.

## 2. Use it everywhere

* Date groups, date children, source view (both levels), `reveal_build` and *delete by date* all use `parse_history_dir` + `local_date_label`.
* Folders that can't be parsed: skip them, log a warning **once per folder name**, never throw.
* Sorting: by `date.getTime()` descending. Use `toLocaleTimeString()` only for the label.
* Store the parsed `Date` on `BuildHistoryItem` (e.g. `build_time?: Date`) instead of re-parsing for sorting.


# Tests

Unit tests (with `process.env.TZ = 'Europe/Vienna'` set before the first `Date` use, or run in a dedicated test file):
* `parse_history_dir('2026-10-22T12.05.01.123Z')` → `2026-10-22T12:05:01.123Z`
* `parse_history_dir('2026-08-14T19.48.46.664582')` → local `19:48:46.664`
* `parse_history_dir('2026-10-22T23.30.00.000Z')` → `local_date_label` = `2026-10-23` (01:30 local), and *delete by date* `2026-10-23` deletes it
* `parse_history_dir('garbage')` → `undefined`
* Sorting `09:05` and `10:00` builds of one day → `10:00` first


### Definition of done
* Folders from both timestamp formats appear in the date and source view
* One unparsable folder never breaks a tree node
* Labels, delete-by-date and reveal use the same local date
* Builds are sorted chronologically, independent of locale
* Unit tests pass; remove bugs.md #17; CHANGELOG entry
