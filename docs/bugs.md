# Bug list

Findings from reviewing the documentation against the code (v1.3.2, 2026-09-29).
Behaviour listed here is **not** described in the user documentation (or only with a warning).
Remove an entry once it is fixed and update the docs where noted.

Severity: 🔴 high (data loss / security / feature unusable), 🟠 medium (wrong behaviour), 🟡 low (cosmetic / cleanup)

- [Security & data loss](#security--data-loss)
- [Broken features](#broken-features)
- [Wrong behaviour](#wrong-behaviour)
- [Cleanup & inconsistencies](#cleanup--inconsistencies)


# Security & data loss

## 1. 🔴 `secret*` variables are stored in plain text in the build history
* **Where:** [OBICommands.ts:226](../src/extension/obi/OBICommands.ts#L226)
* **Current:** after each build `compile_list['config'] = config` writes the full merged configuration (including `[global.variables]` starting with `secret`) into `.obi/build-history/<ts>/compile-list.json`.
  [properties.ts:21-27](../src/extension/obi/compile_list/modules/properties.ts#L21-L27) only removes them from command substitution.
* **Expected:** strip `secret*` variables (and other sensitive values) from the config snapshot.
* **Docs:** [configuration.md → Variables](../asserts/docs/configuration.md#variables) warns about it; remove the warning after the fix.
* **Status:** ✅ fixed (Unreleased): the config snapshot is stored in `config.json` without `secret*` variables, existing history is cleaned once; see [compile-list-size.md](features/compile-list-size.md)

## 2. 🔴 Delete source member has no confirmation and leaves stale config
* **Where:** [SourceListProvider.ts:421-438](../src/webview/source_list/SourceListProvider.ts#L421-L438)
* **Current:** `fs.unlinkSync` without a confirmation dialog. Entries in `dependency.json`, `source-config.toml`, `object-builds.json` and `source-infos.json` remain.
* **Expected:** modal confirmation; clean up entries (like the rename sync does in `sync_renamed_source_member`).
* **Docs:** [sources.md](../asserts/docs/sources.md#create-rename-and-delete-sources) warns about it.

## 3. 🟠 Delete source filter and delete build history date have no confirmation
* **Where:** `obi.source-filter.delete-config` in [SourceListProvider.ts](../src/webview/source_list/SourceListProvider.ts), `obi.build-history.delete-date` in [BuildHistoryProvider.ts:521](../src/webview/build_history/BuildHistoryProvider.ts#L521)
* **Expected:** modal confirmation.
* **Status:** ✅ fixed (Unreleased): modal confirmations for deleting a source filter, a build, a date and the whole build history; see [build-history-retention.md](features/build-history-retention.md)

## 4. 🟠 Transfer all deletes the remote project folder
* **Status:** ✅ fixed (Unreleased): the dialog states the deletion with host and absolute path; see [remote-delete-guard.md](bugfix/remote-delete-guard.md)
* **Where:** [OBITools.ts:1005](../src/extension/utilities/OBITools.ts#L1005), [SSH_Tasks.ts:269-303](../src/extension/utilities/SSH_Tasks.ts#L269-L303)
* **Current:** both "Only minimum" and "Yes" run `rm -rf <remote-base-dir>` first. The first dialog does not mention the deletion; the second one only asks "Process with remote folder ...?".
* **Expected:** state clearly in the dialog that the folder is deleted (or make it optional). Not a bug, but risky.

## 5. 🟠 Deleting the default profile deletes `.user-app-config.toml`
* **Where:** [OBIController.ts:251-257](../src/webview/controller/OBIController.ts#L251-L257)
* **Current:** the delete button deletes the file of the current profile, also if the default profile is active.
* **Expected:** disable delete for the default profile (or ask for confirmation).


# Broken features

## 6. 🔴 Build history: delete single build button never shows
* **Where:** [package.json:443](../package.json#L443), [BuildHistoryProvider.ts:597](../src/webview/build_history/BuildHistoryProvider.ts#L597)
* **Current:** menu condition `viewItem == buildHistoryFile`, but build nodes have `contextValue = 'buildHistoryBuild'`.
* **Expected:** use `buildHistoryBuild` in the `when` clause.
* **Docs:** add "🗑 on a build" to [building.md → Build history](../asserts/docs/building.md#build-history) after the fix.
* **Status:** ✅ fixed (Unreleased): `viewItem == buildHistoryBuild`, documented in building.md

## 7. 🔴 Extended source processing rules created by the UI never match
* **Where:** [app_config_tools.ts:114-128](../src/extension/obi/compile_list/modules/app_config_tools.ts#L114-L128), sample [extended-source-processing-config.toml](../test-workspace-active/.obi/etc/extended-source-processing-config.toml)
* **Current:** the code only knows the condition `SOURCE_FILE_NAMES` (plural); UI and sample write `SOURCE_FILE_NAME`. Unknown conditions return `false`, so the rule never applies.
  The `TARGET_LIB` condition passes an array to `minimatch` (probably throws, needs verification).
* **Expected:** align condition names; handle arrays.
* **Docs:** [configuration.md → Extended source processing](../asserts/docs/configuration.md#extended-source-processing) is only a placeholder; document fully after the fix.

## 8. 🟠 Extended source processing flags cannot be disabled
* **Where:** [EspConfig.ts:56](../src/extension/config/EspConfig.ts#L56), [EspConfig.ts:60](../src/extension/config/EspConfig.ts#L60)
* **Current:** `dict.allow_multiple_matches || true` and `step.add_default_steps || true` are always `true`.
* **Expected:** `?? true`.

## 9. 🟠 Contributed commands that are not registered
* **Where:** [package.json](../package.json), [extension.ts:137-142](../src/extension.ts#L137-L142)
* **Current:** `obi.showErrors`, `obi.show.tools` and `obi.get-remote-compiled-object-list` appear in the Command Palette but fail with "command not found". (`obi.deployment.maintain` is registered again, for the i-Releaser deployment in the build summary.)
* **Expected:** register them or remove them from `package.json`.
* **Status:** open (decision needed). A test now checks that every contributed command is registered; these four are listed there as known exceptions (`src/test/suite/extension.test.ts`).

## 10. 🟠 `when` on `contributes.commands` has no effect
* **Where:** [package.json](../package.json) (`"when": "... && false"`, `"1==2 && ..."`)
* **Current:** `when` is not a valid property for command contributions. Hidden commands are visible in the Command Palette.
* **Expected:** use `menus.commandPalette` with `when` conditions.

## 11. 🟠 `obi.open.file` cannot open files
* **Where:** [extension.ts:113-122](../src/extension.ts#L113-L122)
* **Current:** `vscode.Uri.file(file)` with a path relative to `src/` → file not found.
* **Expected:** join with workspace and source dir (or remove the command, `obi.source-quick-search` does the same).
* **Status:** ✅ fixed (Unreleased): the selected source is opened from the source folder (with `local-base-dir`)

## 12. 🟠 `ssh-concurrency` is ignored
* **Where:** [AppConfig.ts:368-372](../src/extension/config/AppConfig.ts#L368-L372)
* **Current:** `ConfigConnection` is created without `ssh-concurrency`, so the default (5) is always used.
* **Docs:** not documented; add to [configuration.md → Connection](../asserts/docs/configuration.md#connection) after the fix.
* **Status:** ✅ fixed (Unreleased): passed through, limited to 1–32, documented; see [ssh-transfer-optimization.md](features/ssh-transfer-optimization.md)


# Wrong behaviour

## 13. 🟠 Missing mandatory config only warns
* **Where:** [extension.ts:94-102](../src/extension.ts#L94-L102)
* **Current:** "Config not finished!" is shown, but `return` is commented out and `obi.valid-config` is set to `true`, so all views and commands are enabled with an incomplete configuration.
* **Expected:** decide: either keep the views disabled (show the *Invalid config* view) or remove the dead code.
* **Status:** ✅ decided (Unreleased): the views stay enabled with an incomplete configuration (the warning opens the configuration page, and the views are needed to complete it); the *Invalid config* view is for configurations that fail the self check. The dead code is removed; see [reload-free-config-changes.md](features/reload-free-config-changes.md)

## 14. 🟠 Variable precedence: language settings override per-source settings
* **Where:** [properties.ts:29-33](../src/extension/obi/compile_list/modules/properties.ts#L29-L33)
* **Current:** order is general settings → per-source `settings` → language settings → `[general]` → global variables. A per-source `ACTGRP` is overridden by a language setting for the same type.
* **Expected:** per-source settings should win (apply them last).
* **Docs:** [configuration.md → Variables](../asserts/docs/configuration.md#variables) documents the current precedence; update after the fix.
* **Status:** ✅ fixed (Unreleased): same order as the OBI backend, the settings of the source win; documented in configuration.md

## 15. 🟠 Empty sources are always shown as changed
* **Where:** [files.ts:62-65](../src/extension/obi/compile_list/modules/files.ts#L62-L65) vs [DirTool.ts:500](../src/extension/utilities/DirTool.ts#L500)
* **Current:** show changes hashes an empty file as `''`, reset compiled object list uses the real MD5.
* **Expected:** same hash function everywhere.
* **Status:** ✅ fixed (Unreleased): one hash implementation (real MD5 also for empty files); see [source-hashing.md](features/source-hashing.md)

## 16. 🟠 Compile diagnostics ignore `evfevent-output-dir`
* **Where:** [BuildSummary.ts:121](../src/webview/show_changes/BuildSummary.ts#L121), [config_details.html:601](../asserts/templates/controller/config_details.html#L601)
* **Current:** diagnostics are always read from `<.obi/tmp or history>/evfevent/<source>`. The config placeholder shows `.obi/build-output/evfevent`, but the default is `.obi/tmp/evfevent`.
* **Expected:** use the configured path (relative to the downloaded folder); fix the placeholder.
* **Status:** ✅ fixed (Unreleased): see [compile-diagnostics.md](features/compile-diagnostics.md)

## 17. 🟠 Build history delete-by-date may miss builds around midnight
* **Status:** ✅ fixed (Unreleased): labels and delete use the same local date; see [build-history-timestamps.md](bugfix/build-history-timestamps.md)
* **Where:** [BuildHistoryProvider.ts:529](../src/webview/build_history/BuildHistoryProvider.ts#L529)
* **Current:** compares `toISOString()` (UTC date) with the date label of the node (needs verification whether the label is local time).
* **Expected:** use the same date calculation as for the tree labels.

## 18. 🟠 Invalid initial content of `source-infos.json` and `dependency.json`
* **Status:** ✅ fixed (Unreleased): created as `{}`; existing empty files and `[]` are treated as empty
* **Where:** [OBITools.ts:82-87](../src/extension/utilities/OBITools.ts#L82-L87)
* **Current:** a missing `source-infos.json` is created as `[]` (expected object `{}`), a missing `dependency.json` as empty file (invalid JSON).
* **Expected:** create both as `{}`.

## 19. 🟠 Inverted check in `replace_env_variables`
* **Status:** ✅ fixed (Unreleased): the function was unused and is removed; remote paths are resolved by `SSH_Tasks.get_finalized_remote_path`
* **Where:** [AppConfig.ts:317](../src/extension/config/AppConfig.ts#L317)
* **Current:** `~` / `$USER` are only replaced if **no** `ssh-user` is set (then with `'user'`).
* **Expected:** `if (config.connection['ssh-user'])`.

## 20. 🟡 Copybooks from `ALWAYS_TRANSFER_RELATED_COPYBOOKS` need build steps to be transferred
* **Where:** [dependency.ts:34-43](../src/extension/obi/compile_list/modules/dependency.ts#L34-L43), [OBITools.ts:634-664](../src/extension/utilities/OBITools.ts#L634-L664)
* **Current:** sources are only transferred if they have a command with status ≠ `success`. Copybook types without steps get no commands and are never transferred.
* **Expected:** transfer level 0 copybooks regardless of commands.
* **Docs:** [dependencies.md → Copybooks](../asserts/docs/dependencies.md#copybooks) mentions the requirement.

## 21. 🟡 Profile copy does not copy the user ESP file
* **Where:** [OBIController.ts:266-296](../src/webview/controller/OBIController.ts#L266-L296)
* **Expected:** also copy `.user-extended-source-processing-config[-<profile>].toml`.

## 22. 🟡 Folder renames are not synced
* **Where:** [extension.ts:352-381](../src/extension.ts#L352-L381)
* **Current:** only file renames (with supported extension) update `source-config.toml`, `dependency.json`, `object-builds.json` and `source-infos.json`. Renaming a library or source file folder leaves stale entries.


# Cleanup & inconsistencies

## 23. 🟡 SSH key placeholder uses `~`, which is not supported
* **Where:** SSH key field placeholder `~/.ssh/ibmi_rsa` in [config_details.html](../asserts/templates/controller/config_details.html) vs hint "Tilde (~) and env vars (e.g. $HOME) are not supported for paths."
* **Expected:** expand `~` for the key path, or change the placeholder.
* **Status:** ✅ fixed (Unreleased): `~`, `$HOME` / `${HOME}` and `%USERPROFILE%` are expanded; see [ssh-authentication-options.md](features/ssh-authentication-options.md)

## 24. 🟡 Dead configuration keys
* `general.use-remote-obi` (sample TOMLs) and the label "Use remote OBI (show changes)" are not read anywhere.
* `global.settings.general.USE_ESP` ([AppConfig.ts](../src/extension/config/AppConfig.ts)) is declared but unused.
* Remote build list generation (`-a create` on IBM i, [OBICommands.ts:158-169](../src/extension/obi/OBICommands.ts#L158-L169)) is unreachable because `run_build_process` is always called with `false`.
* **Status:** partly fixed (Unreleased): `use-remote-obi` removed from the template; `USE_ESP` is not dead (the Python OBI reads it) and is now honored by the TypeScript build list too. The unreachable remote build list generation is open (decision: remove or offer it).

## 25. 🟡 Sample `build-output-dir` differs from default
* **Where:** [obi-media/.obi/etc/app-config.toml](../obi-media/.obi/etc/app-config.toml) (`.obi/build-output/objects`) vs code default `.obi/build-output` ([Constants.ts](../src/shared/Constants.ts)).
* Since `createBuildList` deletes `build-output-dir` before regenerating, both should match.

## 26. 🟡 Misleading hint in source filter configuration
* **Where:** [source-filter-config.html](../asserts/templates/source_list/source-filter-config.html), `package.nls.json` ("Search patterns are regex based. So, instead of * please use .*")
* **Current:** wildcard is the default; regex only applies if the *Regex* checkbox is set.

## 27. 🟡 `LocaleText` writes into the installed extension
* **Status:** ✅ fixed (Unreleased): missing keys are logged once; `LocaleText` was replaced by `vscode.l10n` (see [localisation.md](features/localisation.md))
* **Where:** [LocaleText.ts:53-56](../src/extension/utilities/LocaleText.ts#L53-L56)
* **Current:** missing keys are written back into `package.nls.json` inside the extension folder at runtime.
* **Expected:** log missing keys instead.

## 28. 🟡 Git info is not shown in the build summary
* `compile-list.json` contains `git.branch` / `git.commit` ([GitInfo.ts](../src/extension/utilities/GitInfo.ts)), but the build summary does not display them. (Feature idea rather than bug.)

## 29. 🟡 Command ID prefix in `CLAUDE.md`
* `CLAUDE.md` says `obi-`, the code uses `obi.`. Tracked in [command-id-naming-convention.md](features/command-id-naming-convention.md).


# Open notes

Moved from `ToDo.md` and `docs/bugs2.md`. These need an example or a decision before they can be fixed.

## 30. 🟠 Job CCSID from extended source processing has no effect
* **Note:** "Job CCSID wird nicht vom ESP übernommen"
* **Current:** `JOB_CCSID` is set as a step property in the default ESP block ([OBIConfiguration.ts](../src/webview/controller/OBIConfiguration.ts)), but no command of the project template uses `$(JOB_CCSID)`, so the value changes nothing.
* **Expected:** clarify which command should use it (e.g. `CHGJOB CCSID(...)` before the compile), then add it to the template.

## 31. 🟠 Dependency: wrong order with copybooks
* **Note:** "Dependency: falsche Reihenfolge bei Copybook"
* **Current:** not reproduced. The order is computed in [dependency.ts](../src/extension/obi/compile_list/modules/dependency.ts) and covered by `DependencyOrder.test.ts`; none of those cases shows a wrong order.
* **Expected:** needs an example `dependency.json` with the expected and the actual order.

## 32. 🟡 Dependencies are not checked for existence
* **Note:** "Checken ob alle Abhängigkeiten (in beide Richtungen) existieren"
* **Current:** entries of `dependency.json` without a source file are skipped silently.
* **Expected:** report them, in both directions (a source that lists a missing dependency, and a dependency of a missing source).

## 33. 🟡 File hash on the client
* **Note:** "Update File HASH on Client side -> sed back!"
* **Current:** hashes are computed locally, and written to `object-builds.json` after a successful build.
* **Expected:** clarify what should be sent back to the IBM i, and why.

## 34. 🟡 i-Releaser backup contains objects that aren't deployed
* **Note:** "Backup hat objekte die gar nicht in die Lib deployed werden"
* **Current:** belongs to the i-Releaser project, not to this extension.
