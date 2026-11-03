# Missing or broken files break whole views

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟡 | finished | [reliability.md R15](../improvements/reliability.md#r15--missing-or-broken-files-break-whole-views) | – |


# Current situation

| Place | Problem |
|---|---|
| [BuildHistoryProvider.ts:126-131](../../src/webview/build_history/BuildHistoryProvider.ts#L126-L131) | Expanding a build parses `compile-list.json` with `JSON.parse` without `try`. A truncated file makes the node fail. (`get_sources_from_build` at line 225 already has a `try`.) |
| [BuildSummary.ts:462-475](../../src/webview/show_changes/BuildSummary.ts#L462-L475) `get_object_list` | Parses `changed-object-list.json` and `dependend-object-list.json` without `try`. |
| [BuildSummary.ts:400](../../src/webview/show_changes/BuildSummary.ts#L400) `generate_html` | `compile_app_config: compile_list['config'] ?? config` throws a `TypeError` when there is no compile-list. The template handles a missing list (`{% if compile_list %}`), but rendering never gets there: the panel opens empty. |
| [LogOutput.ts:109-136](../../src/webview/show_changes/LogOutput.ts#L109-L136) `get_log_content` | Iterates `compile_list['compiles']` and indexes `cmds[cmd_index]` without checks. |


# Fix

1. **Build history:** replace the inline `JSON.parse` with the existing `get_sources_from_build`-style reading (`DirTool.get_json(file, false)`). If the result is `undefined`, return a single child item "compile-list.json could not be read" with `ThemeIcon('warning')`.
2. **`get_object_list`:** use `DirTool.get_json(file, false)` for both files and fall back to empty lists.
3. **`generate_html`:** `compile_app_config: compile_list?.['config'] ?? config`, and make sure the "no build summary yet" state renders a short hint ("Run *Show changes* to create a build summary").
4. **`get_log_content`:** return `''` if the compile-list, level, source or command index don't exist, and let `LogOutputProvider.showOutput` show "No log available" instead of opening an empty document.


# Tests

* Unit test: `BuildSummary.generate_html` with no compile-list → returns HTML, doesn't throw.
* Unit test: history folder with a truncated `compile-list.json` → `getChildren(buildItem)` returns the warning item.
* Unit test: `LogOutput.get_log_content` with an unknown source → `''`.


### Definition of done
* None of the four places throws on missing or invalid files
* Users see an explanatory empty state or warning item
* Unit tests pass; CHANGELOG entry
