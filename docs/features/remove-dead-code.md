# Remove dead and leftover code

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (Unreleased, without the disabled features) | [maintainability.md M6](../improvements/maintainability.md#m6--dead-and-leftover-code) | [bugfix/test-setup.md](../bugfix/test-setup.md) (to confirm nothing breaks) |

Git history keeps everything. Deleting is cheap to undo.


# Current situation and action

Each item was checked with `grep` over `src/` and `asserts/templates/` at review time. **Re-check right before deleting.**

## Files

| Item | Finding | Action |
|---|---|---|
| `example.ts`, `example.js`, `example.js.map` (root) | experiment, not imported | delete |
| `src/shared/AppConfigDict.ts` | not imported | delete |
| `asserts/js/alertBox.js` | empty file (0 bytes) | delete |
| `asserts/templates/show_changes/img/*` (8 images incl. `logo (copy).png`) | not referenced | delete |
| `asserts/img/light_old/**` | not referenced | delete (rest of `asserts/img` in [native-tree-icons.md](native-tree-icons.md)) |

## Functions, types, constants

| Item | Where | Action |
|---|---|---|
| `OBITools.parallel` | [OBITools.ts:958-965](../../src/extension/utilities/OBITools.ts#L958-L965) | delete (only a commented call) |
| `OBICommands.run_system_cmd` (`fork` + ignored `spawn`) | [OBICommands.ts:436-442](../../src/extension/obi/OBICommands.ts#L436-L442) | delete (also listed in [command-injection-hardening.md](command-injection-hardening.md)) |
| `DirTool.get_all_files_in_dir` (generator), `get_shell_config`, `get_key_value_file`, `get_file_changed_date`, `get_encoded_build_output_URI` | [DirTool.ts](../../src/extension/utilities/DirTool.ts) | delete |
| commented-out `hasha` / stream code | [DirTool.ts:468-489](../../src/extension/utilities/DirTool.ts#L468-L489) | delete |
| `dictMerge` | [dict_tools.ts:25-35](../../src/extension/obi/compile_list/modules/dict_tools.ts#L25-L35) | delete (and `deepListMerge` with [dependency-graph.md](dependency-graph.md)) |
| `IChangedSources` | [Source.ts:27-30](../../src/shared/Source.ts#L27-L30) | delete |
| `interface Compile_list` | [BuildSummary.ts:28-35](../../src/webview/show_changes/BuildSummary.ts#L28-L35) | delete |
| `Constants.CHANGED_OBJECT_LIST_NAME`, `DEPENDEND_OBJECT_LIST_NAME` (duplicates of the `_FILE_NAME` constants) | [Constants.ts:28-29](../../src/shared/Constants.ts#L28-L29) | delete |
| `OBIConstants.UPDATE_OBJECT_LIST`, `ESP_SCRIPT_FOLDER`, `JOB_LOG`; the other entries duplicate `Constants` | [obi_constants.ts](../../src/extension/obi/compile_list/modules/obi_constants.ts) | delete the unused ones, then replace `OBIConstants.get('…')` with the `Constants` fields and delete the class |
| `ConfigConnection.attributes_missing`: unused variable `x` | [AppConfig.ts:79-86](../../src/extension/config/AppConfig.ts#L79-L86) | remove the variable |
| commented-out blocks | [source-quick-search.ts:19-71](../../src/source-quick-search.ts#L19-L71), [dependency.ts:175-191](../../src/extension/obi/compile_list/modules/dependency.ts#L175-L191), [BuildHistoryProvider.ts:542-557](../../src/webview/build_history/BuildHistoryProvider.ts#L542-L557), [extension.ts:56-57](../../src/extension.ts#L56-L57), [extension.ts:137-142](../../src/extension.ts#L137-L142), [maintain-source-dependency.html:163-210](../../asserts/templates/source_list/maintain-source-dependency.html#L163-L210) | delete |

## Disabled features (decision needed)

| Feature | State | Options |
|---|---|---|
| Quick settings view (`obi.quick-settings`) | `when: false`, provider still registered | delete, or keep on a branch |
| Deployment / i-Releaser (`obi.deployment`, `obi.deployment.maintain`, [DeploymentConfig.ts](../../src/webview/deployment/DeploymentConfig.ts), [I_Releaser.ts](../../src/webview/deployment/I_Releaser.ts)) | `when: 1==2`, command registration commented out, still bundled | move to a feature branch until it's released, or keep and fix [i-releaser-token-in-url.md](../bugfix/i-releaser-token-in-url.md) first |
| Hidden remote commands (`obi.get-remote-compiled-object-list`, `obi.get-remote-source-list`, `obi.check-remote-sources`) | `when: … && false` | see [bugs.md #9/#10](../bugs.md#9--contributed-commands-that-are-not-registered) and [old-sources-cleanup.md](../bugfix/old-sources-cleanup.md) |
| `general.use-remote-obi`, `USE_ESP` | read nowhere ([bugs.md #24](../bugs.md#24--dead-configuration-keys)) | remove from templates, types and UI |


## Result

* Re-checked and deleted: all items of the first two tables. Already gone earlier in this release: `asserts/js/alertBox.js`, `asserts/img/light_old`, `OBITools.parallel`, `dictMerge`/`deepListMerge`, the commented `hasha` code, the commented blocks in `dependency.ts` and `maintain-source-dependency.html`.
* `USE_ESP` is **not** dead: the Python OBI reads it (`module/app_config_tools.py`) and the config page sets it. The TypeScript build list ignored it, so the checkbox had no effect; it is honored now.
* Disabled features: **kept, decision open** (product decisions): the quick settings view, deployment / i-Releaser (see [i-releaser-token-in-url.md](../bugfix/i-releaser-token-in-url.md), skipped for now), the hidden remote commands (bugs.md #9) and the unreachable remote build list generation (bugs.md #24).


### Definition of done
* Everything in the first two tables deleted (after re-checking)
* Decisions for the disabled features recorded and applied
* `npm run typecheck`, `npm run compile` and `npm test` pass; all webviews still open
* bugs.md #24 removed if covered; CHANGELOG entry (development section)
