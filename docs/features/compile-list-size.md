# Smaller `compile-list.json`

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | finished (Unreleased) | [performance.md P9](../improvements/performance.md#p9--compile-listjson-grows-with-sources--config-size) | [build-list-config-caching.md](build-list-config-caching.md), clarification with the Python OBI |

Related: [bugs.md #1](../bugs.md#1--secret-variables-are-stored-in-plain-text-in-the-build-history), [json-schemas.md](json-schemas.md).


# Current situation

* For every source, `addBuildCmds` stores `sourceItem.variables = getSourceProperties(...)` ([build_cmds.ts:16](../../src/extension/obi/compile_list/modules/build_cmds.ts#L16)). That is the merged dict of general settings, language settings, `[general]` config, global variables **and all `global.cmds` prefixed with `global.cmds.`** ([properties.ts:33](../../src/extension/obi/compile_list/modules/properties.ts#L33)), plus the per-source values. Most of it is identical for every source.
* After the build, the whole merged config is added as `compile_list['config']` ([OBICommands.ts:226](../../src/extension/obi/OBICommands.ts#L226)) and written into the history (with secrets, bugs.md #1).
* The file is transferred to and from the IBM i, parsed several times per build (summary, history, status), rendered and copied into the history.


# New feature

## 0. Precondition: who reads `variables`?

Check in the Python OBI whether `-a run` (or exit point scripts / ESP) reads `compiles[].sources[].variables`, and which keys.
* If it doesn't read them: store only the reduced set from step 1, for display and debugging.
* If it reads specific keys: keep exactly those keys and document them in the compile-list schema ([json-schemas.md](json-schemas.md)).

## 1. Store only source-specific variables

Per source, keep:
* the computed values: `SOURCE`, `SOURCE_FILE_NAME`, `SOURCE_BASE_FILE_NAME`, `TARGET_LIB`, `OBJ_NAME`, `SRC_ATTR`, `SRC_TYPE`, `SET_LIBL`;
* values that differ from `global.settings.general` (i.e. coming from language settings or the per-source `settings`).

Never store `global.cmds.*` or `[general]` paths per source.

## 2. Config snapshot next to the compile-list

* Write the config snapshot of a build to `.obi/build-history/<ts>/config.json` instead of `compile_list['config']`, with `secret*` variables removed (fixes bugs.md #1 together with this).
* `BuildSummary.generate_html` reads `config.json` of the opened history entry. For older entries it falls back to `compile_list['config']`, so existing history still renders.

## 3. Measure

Log the size of `compile-list.json` after creation at `debug` level. Note the before/after size for the test project and a real project in the PR.


## Result

* Precondition: the Python OBI (`module/run_cmds.py`) reads only `source`, `cmds[].cmd`, `cmds[].ignore` and `ignore` of a compile list. `variables` and `properties` are for display and debugging.
* Test project (golden test, 6 sources): 43,516 → 10,693 bytes. Besides `variables`, the steps of an extended source process stored the whole merged config as `properties`; they now store only the step's own properties (and `SET_LIBL` if it differs).
* Found on the way: `LIBL` as a string was split into characters (extension fixed; the Python OBI `get_set_libl_cmd` has the same bug).


# Tests

* Golden test: the reduced `variables` for a source of the test project contain exactly the expected keys.
* Unit test: a history entry with only `compile_list['config']` (old format) still renders the "Remote host" details.
* Unit test: `config.json` in a new history entry contains no `secret*` variables.


### Definition of done
* Precondition clarified with the Python OBI and documented
* Per-source `variables` reduced; no `global.cmds.*` per source
* Config snapshot stored separately and without secrets; old history entries still work
* bugs.md #1 removed (if not fixed separately); CHANGELOG entry
