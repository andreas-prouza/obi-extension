# Build history retention

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | finished (Unreleased) | [usability.md U9](../improvements/usability.md#u9--build-history-grows-forever) | [bugfix/build-history-timestamps.md](../bugfix/build-history-timestamps.md) |

Settings naming: [settings-walkthrough-keybindings.md](settings-walkthrough-keybindings.md). Also covers the missing confirmation of [bugs.md #3](../bugs.md#3--delete-source-filter-and-delete-build-history-date-have-no-confirmation) for the history.


# Current situation

* After each build, `get_remote_build_output` writes `compile-list.json` into `.obi/build-history/<timestamp>/` and copies the complete `.obi/tmp` there ([OBICommands.ts:228-232](../../src/extension/obi/OBICommands.ts#L228-L232)).
* Nothing is ever deleted automatically. The only clean-up is deleting single builds (button currently broken, [bugs.md #6](../bugs.md#6--build-history-delete-single-build-button-never-shows)) or one date, both without confirmation.
* The size of the history is not visible.


# New feature

## 1. Settings

| Setting | Type | Default | Meaning |
|---|---|---|---|
| `obi.buildHistory.maxBuilds` | number | `100` | keep at most n builds; `0` = unlimited |
| `obi.buildHistory.maxAgeDays` | number | `0` | delete builds older than n days; `0` = unlimited |

Scope `resource`, so they can be set per workspace. Add them to `contributes.configuration` and `package.nls*.json`.

## 2. Apply after each build

New function `BuildHistoryProvider.apply_retention(): Promise<number>`:
* list history folders, parse them with `parse_history_dir` ([build-history-timestamps.md](../bugfix/build-history-timestamps.md)), skip unparsable ones (never delete what can't be dated);
* sort newest first; delete folders beyond `maxBuilds` and older than `maxAgeDays`;
* never delete the build that was just created;
* log the deleted folders; return the count.

Called at the end of `get_remote_build_output` (after the new entry is written) and once at activation.

## 3. "Delete all" and confirmations

* New command `obi.build-history.delete-all` ("Delete entire build history", icon `$(clear-all)`) in the `view/title` menu of `obi.build-history`. Add it to `package.json`.
* Modal confirmations ("Delete all 87 builds (412 MB)?", "Delete 5 builds of 2026-10-22?", "Delete build 14:05:01?") for delete-all, delete-date and delete-item.
* Also fix the `when` clause of the delete-item button ([bugs.md #6](../bugs.md#6--build-history-delete-single-build-button-never-shows)) if not already done.

## 4. Show the size

* After refresh, compute the total size of `.obi/build-history` asynchronously (sum of `stat.size`, in the background) and show it in `TreeView.description`, e.g. `87 builds · 412 MB`.
* Don't block the tree on the size calculation.


## Result

* Deviation from step 2: existing history is not deleted silently after an update. As long as neither setting is set by the user, OBI asks once per workspace (*Delete old builds* / *Keep all*, stored in the workspace state); with *Keep all*, retention only runs once a setting is set. After a build the retention runs in the background, so the question doesn't hold up the build.
* The pure selection is [HistoryRetention.ts](../../src/webview/build_history/HistoryRetention.ts) (unit tests); the size is computed asynchronously and only the result of the latest refresh is shown.
* The confirmation for deleting a source filter (the other part of bugs.md #3) was added as well.
* Manual checks open: delete-all from the view title, size updated after a build.


# Tests

* Unit tests for the retention selection (pure function on a list of `{ dir, date }`): `maxBuilds = 2` keeps the 2 newest; `maxAgeDays = 7` drops older; both combined; unparsable entries kept; the new build is never selected.
* Manual: delete-all with confirmation; size shown and updated after a build.


### Definition of done
* Retention settings work and are applied after each build
* Delete-all command; confirmations for all history deletions
* History size visible in the view
* bugs.md #3 (history part) and #6 removed if fixed here; CHANGELOG entry
