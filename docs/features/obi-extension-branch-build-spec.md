# obi-extension: support for branch builds

- **Status:** in progress. Corrections from the review against the current source are marked *Review*.
  - **Done (2026-11-26):** feature-active rule and keeping unknown sections when the user config is saved; B1–B7; C1–C6; P1–P4; D1–D4; 4.6 (step 8: after a watched deployment has finished, `DeploymentWatcher` offers *Branch libraries*, which preselects the merged tickets; the ticket of the deployment isn't needed for that); U1, U2; docs and CHANGELOG.
  - *U1:* project tab only (`OBIConfiguration.branch_build_fields`, `merge_branch_build`). The page edits `enabled`, `ticket-pattern`, `lib-name`, `env` and `no-lib-steps`; other keys (`settings`, …) stay. While all fields are empty, no section is written (the checkbox alone doesn't create one); `enabled` is only written as `false`. The multi-line fields of the page are parsed with `shared/FormFields.ts`; this also fixed a save error of all list and table fields (empty first line, line without `=`). U2: a warning on save if the pattern has no group or the library name no `$(TICKET)`.
  - *P2:* the existing *Add sources changed on this branch* is that check (it lists the changed sources missing from the package and offers to add them), so there's no second command.
  - *4.6, open question 2 solved without a backend action:* the library text is `OBI <branch>` (backend `get_branch_text`). The extension builds that text for every existing branch with the same rule (`lib_text_of_branch`, checked against the backend) and compares; it never parses a possibly shortened text. A local branch without a remote branch counts as *active* (maybe never pushed); only an upstream that git reports as `[gone]` counts as *merged*. Checked against the real backend (`branch-build`): `create --branch` writes `build_context`, `add_source` of another ticket gives the expected error with exit code 0, a version-5 backend fails with `unrecognized arguments: --branch` (exit code 2).
  - **Open:** U3 (left out: needs a backend action, open question 2 doesn't need one any more).
  - *Decided (2026-11-27):* D4 stays. B5: an OBI on IBM i older than 6 is updated before a branch build and before *Branch libraries* (`BranchBuild.ensure_remote_backend`, `BackendUpdate.update_remote_strict`), also without `obi.backend.autoUpdateRemote` and also if it was already updated in this session. If the update fails (e.g. no connection to the git remote) or the version is still below 6, the build is refused with the reason.
  - *U1, checked:* saving the project configuration rewrites `ticket-pattern = '…'` as `"…\\b…"`. The backend's `toml` package reads that correctly; what it rejects is a single backslash (`"\b"`, a TOML escape).
- **Type:** feature
- **Backend reference:** obi repo, branch `branch-build`, commits `3e72ab0` and `899209f` (backend version 6). User docs: `obi/docs/branch-build.md`. Backend spec: `obi/docs/features/branch-build.md`
- **Basis:** the extension as released in version 2.2.2. Names of commands, settings and functions below were checked against the current source (2.2.4).

Concept and workflow: [branch-based-development.md](branch-based-development.md). This document is self-contained. It describes what the OBI backend already does, then what the extension has to do.


## 1. Background

Today all developers build into the same libraries (e.g. `#aaobj`), whatever git branch they're on. A build on one feature branch overwrites the objects of another, and the libraries don't show the state of `main`.

The new concept:

- A build on a branch with a ticket number in its name goes into libraries of that ticket. For example, the branch `PROJ-337-order-rework` builds into `#aa_337`, `#bb_337` and `#cc_337` instead of `#aaobj`, `#bbobj` and `#ccpgm`. The prefix (AA, BB, CC) is the "ENV", the tenant group of the production library. Several libraries of a tenant share one branch library.
- Builds on `main`, and on branches without a ticket number, use the main libraries as before.
- Only `main` is deployed, after the merge, and only from **build package** builds. A build package is `.obi/build-packages/<name>.json`, a list of sources; the extension already manages these.
- Builds use build packages or single sources. Branch builds don't rely on `object-builds.json` (build hashes). "Run build" for changed sources still exists, but its results must never be deployed.
- **The feature is optional.** It's only active when the OBI config (`app-config.toml` merged with the user config) has a `[branch-build]` section that doesn't set `enabled = false`. Without it, OBI and the extension must behave exactly as today, also in workspaces without git and without deployment config.


## 2. What the backend already does (version 6)

### 2.1 Config

```toml
[branch-build]
enabled = true                                  # optional, default true
ticket-pattern = '(?i)\bproj[-_](\d+)'          # Python regex; group 1 = ticket
lib-name = "#$(ENV)_$(TICKET)"
no-lib-steps = [ "global.cmds.skip", "global.cmds.skip2" ]   # optional

[branch-build.env]                              # production library -> ENV
aaobj = "AA"
aadta = "AA"
ccpgm = "CC"
# ...

[branch-build.settings]                         # optional, branch builds only
# INCLUDE_BNDDIR = "$(TARGET_LIB)/GLOBAL"

[global.cmds]
crt-branch-lib = "..."                          # optional, OBI has a default
```

- `ticket-pattern` is a **Python** regular expression with inline flags such as `(?i)`. JavaScript can't evaluate it reliably, so **the extension must not compute the ticket or the libraries itself**. They come from the backend (`build_context`, 2.3).
- A section that exists but is incomplete or invalid is an error in `create`/`add_source`. The backend never falls back to the main libraries in that case.

### 2.2 Command line

- New argument `--branch=<name>` for the actions `create` and `add_source` only. For any other action, argparse fails (exit code 2, message `argument --branch: only for actions create and add_source`).
- Without `--branch`, the backend runs `git rev-parse --abbrev-ref HEAD` in the project folder.
- Without a `[branch-build]` section, `--branch` is ignored.
- A backend older than version 6 fails with `unrecognized arguments: --branch`. This is the same pattern as `--package` with backend version < 5, which the extension already detects.
- `status.json` (`.obi/build-output/status.json`) always contains `"version": <backend version>`.

### 2.3 `build_context` in the compile list

`create` writes it only when the feature is active (in branch and in main mode). Otherwise the key is missing.

```json
"build_context": {
  "mode": "branch",
  "branch": "PROJ-337-order-rework",
  "ticket": "337",
  "libs": ["#aa_337", "#bb_337"],
  "warning": "No git repository (...). Building into the main libraries",
  "error": {"lib": "#aa_337", "cmd": "...", "exit-code": 1, "stdout": "", "stderr": "...", "joblog": "..."}
}
```

| Key | Meaning |
|---|---|
| `mode` | `branch` (ticket libraries) or `main` (main libraries) |
| `branch`, `ticket` | `null` if unknown (no git, detached HEAD) or no ticket in the branch name |
| `libs` | Branch libraries the commands build into. Lower case |
| `warning` | Only when the feature is on but OBI fell back to `main` mode, e.g. no git repository or a detached HEAD |
| `error` | Written by `run` if a branch library couldn't be created. No source is built then |

Other behaviour:

- `add_source` refuses a compile list that was created for a different ticket, or for the main libraries while the current branch has a ticket, and the other way round. `status.json` then has `"status": "error"` and a message that ends with `Create a new build list`. The same ticket on a different branch name is accepted.
- `run` creates the missing libraries of `build_context.libs` before the first level. This happens on IBM i, so **the remote OBI must be version 6 as well.** An older remote OBI ignores `build_context`, the libraries aren't created, and the compiles fail with "library not found". That's safe, but confusing.
- New variables while the feature is active: `TARGET_LIB_MAIN`, `BUILD_MODE`, `BRANCH`, `TICKET`, plus `BRANCH_LIBS` in branch mode. They appear in `variables` of each source in the compile list.
- The compile list keeps unknown keys (`git`, `custom_data`, `package`, ...), as before.

### 2.4 Listing and deleting branch libraries

The action `branch_libs` (also backend version 6) lists and deletes branch libraries on IBM i. It is used by 4.6; its contract is there. Docs: `obi/docs/branch-build.md#removing-branch-libraries`.


## 3. Definitions used below

- **Feature active:** the merged config has a `branch-build` table and `enabled !== false`. Use the same rule as the backend.
  - *Review:* the extension's merged config (`AppConfig.get_app_config()`) only keeps `connection`, `general` and `global`, so `[branch-build]` isn't in it. The extension reads the section itself from both files and merges it like the backend (`dict_merge`: the user value wins, `undefined`/`null`/`''`/`[]` don't override).
  - *Review:* saving the **user** configuration on the config page rebuilt the file from those three sections and deleted every other section, also `[branch-build]`. The save must keep unknown sections.
- **Backend version:** *Review:* `status.json` holds the version of whichever backend ran last (local preview or remote build), so it can't tell them apart. Local: read `OBI_BACKEND_VERSION` from `<local-obi-dir>/module/obi_constants.py`, plus the `unrecognized arguments` error as a second line. Remote: read the same file on IBM i (the read-only script of *Test connection* already does this).
- **Branch context:** `build_context` of the current compile list.
- **Main branch:** `[i-releaser] main-branch` in `.obi/etc/deployment.toml`. It can be empty. Today nothing reads this value.


## 4. Requirements

Everything in 4.1–4.6 applies **only when the feature is active**. Deployment rule D1 is the one exception: it depends on `main-branch`. When the feature is off, there are no new UI elements, no new checks and no new arguments. Existing users must not notice anything.

### 4.1 Backend calls

| # | Requirement |
|---|---|
| B1 | Pass `--branch=<branch>` to `create` and `add_source` when the git info has a branch (`get_git_info`, which reads `.git` directly). On a detached HEAD or without `.git`, pass nothing; the backend handles that. *Review:* the call sites with a local OBI are `create` of *Preview build* (`local_obi_create_args`), `create` in `generate_build_script`, and `add_source` of the build summary (`add_sources_via_local_obi`). The `create` on IBM i is refused by B4 |
| B2 | Pass `--branch` only to backend version ≥ 6. If the call fails with `unrecognized arguments: --branch`, show "The local OBI is too old for branch builds. Update it in {local-obi-dir}" (same pattern as `--package`) |
| B3 | **Safety:** if the feature is active and the local backend is older than 6, refuse `create` and `add_source` with that message. Never fall back to a call without `--branch`: an old backend ignores `[branch-build]` and would build into the main libraries |
| B4 | No local OBI (context `obi.run_native`, `without_local_obi()`): if the feature is active, refuse all builds with "Branch builds need the local OBI (local-obi-dir)". The JS fallback can't evaluate the ticket pattern and would build into the main libraries. *Review:* this includes *Preview build* and *Add source*: *Run build* uploads exactly the list of the preview, and without a local OBI that list comes from the TypeScript port. It also includes `create` on IBM i, where `.git` isn't transferred, so the backend can't read the branch |
| B5 | Before `run`/`submit` of a compile list with `build_context.mode == "branch"`, make sure the remote OBI is version ≥ 6. Use the existing remote update mechanism (`obi.backend.autoUpdateRemote`) where possible; otherwise refuse with "Update the OBI on IBM i ({remote-obi-dir}) for branch builds" |
| B6 | `add_source` error ending in `Create a new build list`: show it with an action button that creates a new build list for the current selection (or the package) |
| B7 | *Review, new:* before *Run build* of an existing list (build summary, also a list of the build history), compare `build_context.branch` with the current git branch. The backend checks the ticket only in `create`/`add_source`, not in `run`, so the list would build into the libraries of the other ticket. If they differ, refuse with "The build list was created on branch X" and the button "Create a new build list". The extension can't compute tickets (non-goal), so a different branch name with the same ticket is refused as well |

### 4.2 Showing the context

| # | Requirement |
|---|---|
| C1 | Status bar (the existing `obi.status-bar.menu` item): in branch mode show e.g. `OBI: #337 → #aa_337, #bb_337`, in main mode `OBI: main libraries`. Source: `build_context` of the current compile list. Nothing extra when the feature is off. *Review:* `build_context.libs` is lower case, `branch_libs --list` returns upper case: compare case-insensitively everywhere |
| C2 | If the current git branch differs from `build_context.branch`, show the status bar item as a warning with the tooltip "The build list was created on branch X". Running it would build into the libraries of X |
| C3 | After `create`, show `build_context.warning` once as a warning message |
| C4 | Build summary (webview) and build output: show mode, ticket and libraries. In branch mode, add a copyable line for testing: `ADDLIBLE #aa_337` per library (target libraries from `libs`) |
| C5 | After `run`, if `build_context.error` exists, show "Branch library {lib} could not be created" with the `stderr`, and a button that opens the joblog |
| C6 | Build history: store and show `build_context.mode`/`ticket` with each build, so a branch build can be told apart from a main build |

### 4.3 Build packages

| # | Requirement |
|---|---|
| P1 | **Package check** before a package build in branch mode: compare the package sources with the sources changed on the branch. Use the existing logic of `obi.build-package.add-branch-changes` (`git merge-base HEAD <base>` + `git diff`, base from the setting `obi.buildPackages.baseBranch`, otherwise ask). Changed sources with a supported object type that are missing from the package are listed, with "Add and build", "Build anyway" and "Cancel". Ignore deleted files |
| P2 | The same check as a command, "Check build package against branch changes", e.g. before opening a PR |
| P3 | If the branch has a ticket (known from the last `build_context`) and there's no package with the branch name, offer once per branch to create one. The extension already suggests the branch name in `obi.build-package.create` |
| P4 | Without a base branch and without git, P1–P3 are skipped silently |

Why P1 matters: without build hashes, a source that changed on the branch but is missing from the package isn't built in the branch, isn't built on `main`, and isn't deployed, even though it's merged.

### 4.4 Deployment guard

This is in `start_workflow` (the call `POST /api/start_workflow/{workflow}` and every UI path that leads to it). Each rule applies only when its config exists:

| # | Rule | Applies when |
|---|---|---|
| D1 | `git.branch` of the compile list equals the main branch, **and** `git.commit` is already on `origin/<main-branch>` (`git fetch` first, then `git merge-base --is-ancestor <commit> origin/<main-branch>`). A compile list without `git` is refused. *Review:* the extension refreshed `git` to the current HEAD on **every** write of the list (checkboxes, edit command, custom data, add source). Building on a branch, switching to `main` and ticking a checkbox made the list claim `main`. `git` is now written when the list is created and kept afterwards | `main-branch` is not empty |
| D2 | `build_context.mode == "main"` | feature active |
| D3 | The compile list has `package` (it was a package build) | feature active |
| D4 | The working tree had no uncommitted changes in the source directory when `create` ran. Record this in `create` as `git.dirty` (`git status --porcelain -- <source-dir>`) | feature active |

- Message when a rule fails: "Deployment only from package builds on {main-branch}, after the merge." followed by the reason, e.g. "Branch: PROJ-337-x", "Not a package build" or "Commit not on origin/main".
- With an empty `main-branch` and the feature off, deployment works as today.
- The compile list (without `compiles`) is already sent as custom data, so `build_context` and `package` reach i-releaser automatically. Keep it that way: i-releaser runs the same checks again as a pre-check.
- D4 isn't in the original concept. Uploaded sources come from the working tree, not from the commit, so a `main` build with local changes could deploy code that isn't in `main`. Decided to keep it.
- Mention in the changelog that `main-branch` is now enforced: users who already set it get rule D1.

### 4.5 Configuration UI

| # | Requirement |
|---|---|
| U1 | Config page (`obi.controller.config`): a "Branch build" section with `enabled`, `ticket-pattern`, `lib-name`, `no-lib-steps` and a table editor for `env`. It is written to `app-config.toml`. Writing `ticket-pattern` as a TOML literal string (`'...'`) is mandatory: the backend's `toml` package rejects `"\\b"` |
| U2 | Show a hint that the pattern is a Python regular expression and group 1 is the ticket. Don't validate it with JavaScript beyond "not empty" and "contains `(`" |
| U3 | Optional, lowest priority: a "Test" button that shows which ticket and mode the current branch would get. It needs a backend action for that (open question 2); without one, leave U3 out |

U1–U3 can come in a later release. The feature works with a hand-written config.

### 4.6 Removing branch libraries

Command `OBI: Branch libraries` (also a button in the OBI build view):

1. Call the remote OBI, `main.py -a branch_libs -p . --list`, over the existing SSH path.
2. Group the libraries by ticket and get each ticket's state from git, after `git fetch --prune`:
   - **active:** a branch with this ticket exists and isn't merged into `origin/<main-branch>`.
   - **merged:** the branch is contained in `origin/<main-branch>` (`git merge-base --is-ancestor`), or its remote branch was deleted (squash merge, auto-delete on GitHub).
   - **orphaned:** no local or remote branch matches the ticket.
   - Matching a branch to a ticket: the backend returns `ticket` per library (below), and the branch names come from `git branch -a`. To compare a branch name with a ticket, use the ticket of the build history or of `build_context`, or ask the backend (see open question 2).
3. Multi-select quick pick, one line per ticket, e.g. `PROJ-337 · merged · #aa_337, #bb_337 · last used 2026-11-20`. Merged and orphaned tickets are preselected, active ones aren't.
4. A modal confirmation lists every library and says that deleting can't be undone.
5. Call `main.py -a branch_libs -p . --delete=#AA_337,#BB_337`. The backend validates every name again and refuses anything else (2.4). Quote the argument for the remote shell.
6. Report the result: deleted libraries, and failed ones with their reason (e.g. locked because a job has it in its library list).
7. Offer to archive the ticket's build package (`"archived": true`, already supported).
8. Optional: when a deployment of "Deploy OBI Build" finishes, ask "Ticket 337 deployed – delete its branch libraries?" and open the same command. The ticket comes from the package name or `jira.ticket-id`.

Backend contract (implemented, backend version 6). The result is in `status.json` and also as one JSON line on stdout:

```json
// -a branch_libs --list
{"version": 6, "status": "ok", "libs": [
  {"name": "#AA_337", "env": "AA", "ticket": "337", "text": "OBI PROJ-337-order-rework",
   "created": "2026-11-20 10:00:00", "last_used": "2026-11-21", "owner": "PROUZA", "size": 1234567}
]}
// -a branch_libs --delete=#AA_337,#BB_337
{"version": 6, "status": "ok", "deleted": ["#AA_337"], "failed": [{"name": "#BB_337", "message": "CPF2125 ..."}]}
// errors, e.g. feature off, a name that isn't a branch library (then nothing is deleted)
{"version": 6, "status": "error", "message": "Not a branch library: #AAOBJ. Nothing was deleted", "details": "..."}
```

- Names are upper case. The list is sorted by ticket, then name. `last_used` and `size` can be `null`.
- A branch library matches `lib-name`, with an ENV of `[branch-build.env]` and a ticket that matches the group of `ticket-pattern`. Main and production libraries are never included.
- `--delete` with a name that doesn't exist: `failed` with `"Library not found"`.
- The command is only visible when the feature is active and the backend version is ≥ 6.


## 5. Non-goals

- Computing tickets or library names in the extension (the backend owns that)
- Copying data into branch libraries
- Any change to builds when the feature is off
- i-releaser changes (its pre-check is a separate task; it reads the same `custom_data`)


## 6. Acceptance criteria

1. **Feature off:** with a workspace without `[branch-build]` (with and without `.git`, with and without `deployment.toml`), every build, package build and deployment behaves exactly as in 2.2.2. No `--branch` is passed, and no new UI appears.
2. **Feature on, branch `PROJ-999-test`:** `create` gets `--branch=PROJ-999-test`, the status bar shows `#999 → ...`, and the summary lists the libraries with `ADDLIBLE` lines.
3. Feature on, local backend version 5: `create` is refused with the update message. It is not called without `--branch`.
4. Feature on, no local OBI: builds are refused.
5. Feature on, remote OBI version < 6: running a branch-mode list is refused, or the remote OBI gets updated first.
6. `add_source` after switching to a branch of another ticket: the error is shown with the "Create new build list" action.
7. Package check: change a source on the branch without adding it to the package; the package build shows it as missing.
8. **Guard:** with the feature on and `main-branch = "main"`, the extension refuses to start a workflow
   - from a branch build,
   - from a build of changed sources on `main` (no package),
   - from a package build on `main` whose commit isn't on `origin/main`,
   - from a package build on `main` with uncommitted changes (D4).

   A package build on `main` of a pushed commit starts.
9. With the feature off and `main-branch = "main"`, only D1 applies.
10. `build_context.error` after `run` is shown with the stderr.
11. All new user-visible strings are in `package.nls.json`/`l10n` and have a German translation (`package.nls.de.json` and the German l10n bundle).
12. Unit tests for: the feature-active rule, the version gating (B2/B3), the guard rules D1–D4 (with a mocked git), and the package check diff.


## 7. Implementation notes

*Implemented in:* `src/shared/BranchBuild.ts` (pure rules: active, `build_context`, B7 mismatch, version, D1–D4), `src/extension/config/BranchBuildConfig.ts` (merged section), `src/extension/obi/BranchBuild.ts` (B3–B5, B7, D1–D4 with git, texts), `OBICommands` (B1, B2, record of `git` at create, C3, C5, P3), `BuildSummary` (B6, C4, guard before `start_workflow`), `StatusBar`/`StatusText` (C1, C2), `BuildPackageCommands` (P1), `GitChanges` (`has_uncommitted_changes`, `commit_on_remote_branch`). `src/extension/obi/BranchLibraries.ts` (4.6), `HistoryIndex`/`BuildHistoryProvider` (C6). Tests: `src/test/unit/BranchBuild.test.ts`, `src/test/unit/HistoryIndex.test.ts`, `src/test/suite/BranchBuild.test.ts`.

- Ordering: B1–B6, C1–C5, P1, P3 and D1–D4 first. Then 4.6, C6, P2 and U1–U2.
- Docs to update in the extension: `asserts/docs/building.md` (branch builds, guard), `asserts/docs/configuration.md` (`[branch-build]`, link to the backend docs `obi/docs/branch-build.md`), and `CHANGELOG.md`.
- Raise the extension's own minimum backend version only for the branch build features. Users without the feature must keep working with backend version 5.
- Existing pieces to reuse:
  - git info: `get_git_info`/`attach_git_info`
  - branch diff: `add-branch-changes` (`merge-base`, `diff`, branch name validation)
  - backend args: `local_obi_args(config, action, source, extraArgs)`
  - old-backend detection: the `unrecognized arguments:.*--package` check
  - deployment config validation: `main-branch` is already a field of `deployment.toml`


## 8. Open questions

*Review, outside the extension:* an i-releaser pre-check that recognises branch libraries by name must compare case-insensitively and allow an ENV of up to 8 characters: the backend writes lower-case names into `build_context`.


1. D4 (no uncommitted changes) is new compared to the original concept. Keep it? *Decided: yes.*
2. Ticket ↔ branch matching for 4.6: should the backend offer an action to evaluate `ticket-pattern` for a list of branch names (e.g. `-a branch_info --branch=...`)? Then the extension never needs the Python regex.
3. B5: should the extension update the remote OBI automatically for branch builds, or only refuse? *Decided: update automatically; refuse only if the update fails.*
