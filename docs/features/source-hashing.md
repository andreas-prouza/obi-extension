# Hash sources once, with a cache

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🔴 | finished (no snapshot comparison against the old implementation; the dependents algorithm itself is unchanged, see dependency-graph.md) | [performance.md P1](../improvements/performance.md#p1--the-source-tree-is-hashed-twice-per-show-changes-once-synchronously), [P13](../improvements/performance.md#p13--batched-hashing-blocks-on-the-slowest-file-and-arrays-are-concatenated-quadratically), part of [P12](../improvements/performance.md#p12--synchronous-file-io-in-hot-paths) | [bugfix/test-setup.md](../bugfix/test-setup.md), [dependency-graph.md](dependency-graph.md) (for step 4) |

Also fixes [bugs.md #15](../bugs.md#15--empty-sources-are-always-shown-as-changed).


# Current situation

A full *Show changes* without local OBI (`OBITools.generate_source_change_lists`, [OBITools.ts:786-813](../../src/extension/utilities/OBITools.ts#L786-L813)):

1. `get_changed_sources()` → `retrieve_current_source_hashes()` ([OBITools.ts:898-953](../../src/extension/utilities/OBITools.ts#L898-L953)) walks `src/` (async) and MD5-hashes every source.
   * Hashing runs in batches of `max-threads + 1` and waits for the whole batch before starting the next one.
   * Results are concatenated with `[...a, ...b]` (O(n²)).
   * Cancellation is a string flag in `OBITools._threads`.
2. `get_dependend_sources()` computes dependents with its own algorithm. The result is only written to `.obi/tmp/dependend-object-list.json`.
3. `createBuildList()` ([createBuildList.ts:32-38](../../src/extension/obi/compile_list/createBuildList.ts#L32-L38)) → `getFiles()` ([files.ts:6-31](../../src/extension/obi/compile_list/modules/files.ts#L6-L31)) walks `src/` **again**, synchronously (`readdirSync`, `statSync`, `readFileSync`), and hashes every file a second time on the extension host thread. Then `getBuildOrder` computes the dependents a second time, with a different algorithm.
4. The two hash functions differ for empty files: `files.ts` returns `''`, `DirTool.get_file_hash` returns the real MD5 (bugs.md #15).
5. Extension filters differ: `files.ts` uses `file.endsWith(ext)` (`foo.notpgm` matches `pgm`), `DirTool` compares the last suffix.

Every file is read twice per run, although usually only a handful of files changed.


# New feature

## 1. One hashing module

New file `src/extension/obi/compile_list/modules/source_hashes.ts`:

```ts
export interface HashOptions {
  concurrency: number;                    // config general.max-threads, default 20
  use_cache: boolean;                     // false for "Reset compiled object list"
  token?: vscode.CancellationToken;
}

/** Map of '/'-separated source path (relative to the source root) → md5 hex. */
export async function compute_source_hashes(source_root: string, extensions: string[], options: HashOptions): Promise<Map<string, string>>
```

* **Walk:** async (`fs.promises.readdir(dir, { withFileTypes: true })`), extension filter on the last suffix (`name.split('.').pop()`), result keys always with `/`.
* **Hash:** MD5 of the content via stream, also for empty files (`d41d8cd98f00b204e9800998ecf8427e`). This is the only hash function; `files.getFileHash` and `DirTool.get_file_hash` delegate to it.
* **Concurrency:** a small worker pool (start the next file as soon as one finishes), collecting results into the `Map`.
* **Cancellation:** check `token.isCancellationRequested` between files and throw `UserCancelledError` ([bugfix/input-cancel-shows-error.md](../bugfix/input-cancel-shows-error.md)). Remove `OBITools._threads` / `OBITools.cancel`.

## 2. Hash cache

* File `.obi/cache/source-hashes.json`: `{ "version": 1, "entries": { "<source>": { "size": n, "mtime_ms": n, "md5": "…" } } }`.
* For each file, `stat` it; if `size` and `mtimeMs` equal the cache entry, reuse the hash, otherwise read and hash it.
* Write the cache atomically after a successful run ([bugfix/swallowed-write-errors.md](../bugfix/swallowed-write-errors.md)); drop entries of deleted files.
* `.obi/cache/` is **not** inside `.obi/tmp` (which is cleared on every run). Add it to the `.gitignore` template ([project-template-gitignore.md](project-template-gitignore.md)) and to the transfer excludes ([bugfix/sensitive-files-upload.md](../bugfix/sensitive-files-upload.md)).
* *Reset compiled object list* uses `use_cache: false`.
* Known limit: a change that keeps both size and mtime (same millisecond) isn't detected. Document it; *Reset compiled object list* is the escape hatch.

## 3. Compute once, pass down

* `generate_source_change_lists` calls `compute_source_hashes` once and passes the map to `createBuildList(source?, hashes)`.
* `createBuildList` → `getChangedSources(build_list_path, hashes)` no longer walks or hashes. `getFiles` is removed.
* `retrieve_current_source_hashes` becomes a thin wrapper returning the map. Callers `reset_compiled_object_list` and `process_check_remote_sources` are adapted (they used an array of one-key objects).

## 4. Dependents once

Remove `OBITools.get_dependend_sources` / `add_all_dependend_sources`. The dependents come from the build order computed in `createBuildList` ([dependency-graph.md](dependency-graph.md)), and `generate_source_change_lists` writes `dependend-object-list.json` from that result.

## 5. Migration note

Because empty files now get a real MD5, empty sources with a `''` entry in `object-builds.json` are reported as changed **once** after the update. Mention it in the CHANGELOG.


# Tests

* Unit tests with a temporary folder: hashes of known contents (incl. an empty file); `.notpgm` not matched by `pgm`; backslash-free keys on Windows.
* Cache: second run with no changes reads no file content (spy on `fs.createReadStream`); changing one file re-hashes only that file.
* Cancellation: a token cancelled after the first file → `UserCancelledError`.
* Snapshot: `compile-list.json` for the test project is identical (apart from `timestamp` / `git`) before and after the change.


### Definition of done
* One async hash implementation, used for show changes, build list, reset object list and remote check
* Every source is read at most once per run, and unchanged sources not at all when the cache is valid
* No synchronous file walk/hash in the build-list path
* Dependents computed once
* bugs.md #15 removed; CHANGELOG entry
