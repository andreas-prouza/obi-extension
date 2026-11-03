# Faster source filter tree

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (Unreleased) | [performance.md P7](../improvements/performance.md#p7--the-source-filter-tree-rescans-src-for-every-filter-on-every-refresh), part of [P12](../improvements/performance.md#p12--synchronous-file-io-in-hot-paths) | [file-watcher-debounce.md](file-watcher-debounce.md) |


# Current situation

* `SourceListProvider.getChildren()` for the root ([SourceListProvider.ts:58-94](../../src/webview/source_list/SourceListProvider.ts#L58-L94)) starts `LocalSourceList.get_filtered_sources_with_details()` for **every** filter file. Each call walks the whole source folder again (`get_local_sources` → `DirTool.get_all_files_in_dir3`, [LocalSourceList.ts:111-138](../../src/extension/utilities/LocalSourceList.ts#L111-L138)), even for filters that are never expanded.
* Every `load_source_list()` runs `obi.source-filter.update` → root refresh → all walks again ([LocalSourceList.ts:44](../../src/extension/utilities/LocalSourceList.ts#L44)).
* `get_filtered_sources` ([LocalSourceList.ts:202-256](../../src/extension/utilities/LocalSourceList.ts#L202-L256)) compiles RegExp / wildcard matchers for every source × filter entry. An invalid regex throws and breaks the filter. A source matching two entries is added twice.
* `get_values_by_key` ([SourceListProvider.ts:560-581](../../src/webview/source_list/SourceListProvider.ts#L560-L581)) deduplicates with `result.some()` (O(n²)).
* `load_source_infos` calls `existsSync` for every entry of `source-infos.json` ([LocalSourceList.ts:88-92](../../src/extension/utilities/LocalSourceList.ts#L88-L92)).
* `this.items` collects every created tree item and is only cleared on root refresh. `onDidChangeActiveTextEditor` searches it linearly ([SourceListProvider.ts:456-476](../../src/webview/source_list/SourceListProvider.ts#L456-L476)).


# New feature

## 1. One cached source inventory

`LocalSourceList` keeps one inventory from a single walk:

```ts
interface SourceInventory {
  all: IQualifiedSource[];                 // incl. empty lib/file folders (for show-empty-folders)
  supported: Set<string>;                  // 'lib/file/member.ext' of supported types
}
```

* `load_source_list()` builds it (async walk, see [source-hashing.md](source-hashing.md) for the shared walker) and replaces both `source_list` and the `get_local_sources(false)` walk.
* `load_source_infos` filters against `inventory.supported` instead of `existsSync`.

## 2. Lazy, memoized filters

* The root level only lists filter files (no evaluation).
* A filter is evaluated when its node is expanded, and the result is memoized per filter file until the inventory or that filter file changes.

## 3. Precompiled matchers

```ts
interface CompiledFilter { lib: (s: string) => boolean; file: (s: string) => boolean; member: (s: string) => boolean; show_empty: boolean; }
function compile_filter(entry: IQualifiedSource): CompiledFilter | { error: string }
```

* Compile once per filter entry (wildcard via `wildcard-match`, regex via `new RegExp('^…$', 'i')` inside `try`).
* Invalid regex: show "Filter '<file>' entry <n>: invalid regular expression …" once, and skip that entry.
* Matching results are collected in a `Map<key, IQualifiedSource>` (no duplicates).

## 4. Tree internals

* `get_values_by_key` uses a `Set` per level.
* Replace `this.items` with a `Map<string, SourceListItem>` keyed by `filter|lib|file|member`, rebuilt on root refresh. `getParent` and the active-editor reveal use the map.


## Result

* [SourceInventory.ts](../../src/extension/utilities/SourceInventory.ts) (no vscode, unit-tested): `walk_sources` (one async walk, files and empty folders, `/` on every platform), `compile_filter`, `apply_source_filters` (`Map`, no duplicates). It is not shared with the hash walk of [source-hashing.md](source-hashing.md), which needs file stats and the supported types only.
* `DirTool.get_all_files_in_dir`, `get_all_files_in_dir2` and `get_all_files_in_dir3` were removed (no users left).
* Measured (Linux, tmpfs, 10,000 sources, 20 filters): walk 6 ms, one filter 5 ms, all 20 filters 44 ms. The root refresh evaluates no filter.
* Found on the way: with *show empty folders*, an empty library folder (on Windows any empty folder) crashed the filter; regular expressions were lowercased; the filter icon was never shown (`'source_list'` instead of `'source-list'`).


# Tests

* Unit tests for `compile_filter` + matching: wildcard, regex, case-insensitivity, invalid regex, empty folders.
* Unit test: refreshing the root doesn't walk the source folder (spy on the walker); expanding a filter twice evaluates it once.
* Performance check (documented, not in CI): 20 filters, 10,000 sources → root refresh < 50 ms, expanding one filter < 200 ms.


### Definition of done
* One source walk per change of the source folder
* Filters evaluated lazily, memoized, with precompiled matchers; invalid filters reported, not crashing
* No O(n²) deduplication; tree items indexed in a map
* CHANGELOG entry
