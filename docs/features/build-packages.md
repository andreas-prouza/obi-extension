# Build packages

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (Unreleased; unit and integration tests, backend tests; not yet built against a real IBM i) | User request 2026-11-19 | Backend: [obi/docs/features/build-packages.md](../../../obi/docs/features/build-packages.md) |


# Current situation

* OBI builds either all changed sources (hash compare with the local `object-builds.json`) or the current source, each with its dependent objects.
* There is no way to name a set of sources that belong together (a ticket, a feature) and build exactly this set again, on any machine.
* `object-builds.json` is local: "changed" means changed since *my* last build, so it can't describe a piece of work for the team.


# New feature

A **build package** is a named, explicit list of sources. Building a package always builds **all its sources and their dependent objects**, whatever their hash. Packages are committed with the project and shared via git.

## Package file

* One file per package: `.obi/build-packages/<name>.json`. The file name is the package name.

  ```json
  {
    "description": "Order entry rework (ABC-123)",
    "sources": [
      "mylib/qddssrc/orders.pf.file",
      "mylib/qrpglesrc/order.sqlrpgle.pgm"
    ]
  }
  ```

* `sources`: paths relative to the source directory, `/`-separated, as everywhere in OBI. Written sorted and without duplicates, one per line, with 2-space indentation and a trailing newline, so a change touches only its own lines.
* `description`: optional.
* Other keys are kept when the extension rewrites the file (a newer version may add some).
* A file that is not valid JSON is never overwritten. The error shows where the problem is.
* JSON schema `asserts/schemas/build-package.schema.json` for `**/.obi/build-packages/*.json`.

## Package name

* `^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`, so the name can't leave the folder.
* A name that differs from an existing one only in case is refused (Windows and macOS file systems).
* *New build package* suggests the current git branch, with invalid characters replaced by `-` (`feature/ABC-123 x` → `feature-ABC-123-x`). If a package of that name exists, the next free `-2`, `-3`, …. No suggestion for a detached HEAD.
* A branch may have several packages. Packages stay in the project after a merge.

## Build list of a package

* All sources of the package are forced into the build list, plus all objects depending on them (`dependency.json`), with the same levels as *Show changes*.
* A forced source counts as **new** if it is not in `object-builds.json`, otherwise as **changed** (`changed-object-list.json`). This is the same rule as for *Current source*, which uses the same path now.
* `compile-list.json` gets `"package": { "name": "...", "description": "..." }`. It is shown in the build summary header (next to the git branch), in the build history, and sent to i-Releaser with the build list.
* A source of the package that doesn't exist, or whose type isn't in `supported-object-types`, is an error: no build list is created. The message lists the sources and offers *Remove from package*.
* With a local OBI (`local-obi-dir`), the extension calls `main.py -a create -p . --package <name>`. If the local OBI doesn't know `--package` yet, the error says to update it.
* The backend ends with exit code 0 also after an error and keeps the previous build list if the package is invalid. So after `create` with a local OBI, the extension reads `status.json`: with `"status": "error"` it doesn't show or build the list (for all scopes, not only packages). The message is shown as before by `OBIController.check_obi_response`.
* Building runs as for *Show changes* / *Run build*: under the operation lock, with the build summary afterwards.

## Build packages view

New tree view **Build packages** in the OBI view container, between *Source filters* and *Build history*.

* **View title**: ➕ *New build package*, ↻ *Refresh*. Without packages, the view shows a button *Create build package*.
* **Package** (icon `package`, description: description · number of sources):
  * inline: ▶ *Run build*, *Show build list*, ➕ *Add sources…*
  * context menu: *Add sources…*, *Add changed sources…*, *Rename…*, *Edit description…*, *Open as JSON*, *Delete* (asks first)
* **Source** (file icon, description: library/source file; warning icon if the file is missing): click opens it; inline 🗑 *Remove from package* (several at once with multi-select).
* *Add sources…*: multi-select QuickPick of all sources not yet in the package, searchable by name and description (the same picker as *Add source* in the build summary).
* *Add changed sources…*: the same QuickPick with the new and changed sources (hash compare) preselected.
* **Add to build package…** in the submenu *OBI* of the explorer (multi-select), editor tab and source filter member: QuickPick of the packages and *New build package…*.
* The Command Palette variants without a package ask for it.
* The view follows changes of the folder (also git checkout or pull).
* Renaming a source (Source filters tree or explorer) renames it in all packages.

## Backend

`main.py -a create --package <name>`: see [obi/docs/features/build-packages.md](../../../obi/docs/features/build-packages.md). The extension doesn't need it on the IBM i: it creates the build list locally and uploads it.

## Sources changed on the branch

*Add sources changed on this branch to build package…* (package context menu, Command Palette):

* Base branch: the setting `obi.buildPackages.baseBranch`; empty: `origin/HEAD`, otherwise the first of `main`, `master`, `origin/main`, `origin/master` that exists; otherwise an input box. The name is checked (`[A-Za-z0-9._/-]`, no leading `-`, no `..`), git is called without a shell.
* Files: `git diff --name-only --relative --diff-filter=d <merge-base>` (committed, staged and not staged changes, without deleted files) and `git ls-files --others --exclude-standard` (new, not ignored), both run in the source folder, so only its files count.
* Offered: the files with a supported type that are valid source names and not yet in the package, all selected (QuickPick).
* Unlike *Add changed sources* (hash compare with the personal `object-builds.json`), the result is the same for everybody on the branch.

## Drag and drop

* *Source filters* (now multi-select): members can be dragged; the drag carries `application/vnd.obi.sources` (JSON list of source names) and `text/uri-list` (the editor opens them on a drop).
* *Build packages* accepts both, so also files from the Explorer. A drop on a package or one of its sources adds them to that package; files that aren't supported sources are left out. A drop beside a package only shows a hint.
* Sources of a package can be dragged onto another package (copied).

## Build history by package

* *Filter build history by build package* (view title of the build history): QuickPick of the packages found in the history with their number of builds, and *All builds*. Combined with the source filter, in both layouts (date and source).
* *Show builds of build package* (package context menu) applies the filter and shows the build history.

## Filter and archive in the view

* *Filter build packages…* (view title): a text matched against name, description and sources, not case-sensitive. The view shows the filter; *Clear build package filter* removes it. Not stored.
* *Archive build package* writes `"archived": true` into the file (so it is shared via git); *Restore archived build package* removes the key. Archived packages are hidden; the view title shows `n archived hidden`. *Show / Hide archived build packages* switches (stored per workspace). Archived packages can still be built, and are listed last in the package QuickPicks.
* Invalid package files are always shown.

## Sources of a build

*Add sources of the build to build package…* (`obi.build-package.add-build-sources`):

* From the build summary (button *Add to build package*, message `add_to_build_package` without fields: the extension uses the displayed compile list, live or from the history), the context menu of a build in the build history, or the Command Palette (current build list). A path outside the workspace is refused.
* Sources: all of the build list in build order, also dependents, without invalid names (`sources_of_build_list`). Not the related copybooks of level 0 (`ALWAYS_TRANSFER_RELATED_COPYBOOKS`): forced into a package, each of them would pull in all objects that use it (a build of 81 sources became 1460). The build of the package adds them on level 0 again. Bugfix 2026-11-23.
* First a multi-select QuickPick of these sources (like *Add source*): selected, except those unchecked in the build list (`ignore`; a source listed more than once counts as checked if one entry is). Then the package (QuickPick with *New build package…*). Sources already in the package are reported as such.

## Last build of a package

* Stored per person in `.obi/cache/build-packages-last-build.json` (git-ignored with `.obi/cache/`), not in the package file: the result belongs to the own IBM i, and the build history it links to is local. Decided 2026-11-19.
* Content per package: `status` (`success`, `failed`, `incomplete` = none failed but not all built), `timestamp` (ISO), `history` (folder in `.obi/build-history`), `total`, `failed`, `not_run`. Counted like the status bar (`source_status`, ignored sources don't count).
* Written by `OBICommands.write_build_history` for a build list with `package`, i.e. after every build whose results were downloaded (also *Get last build results* and builds of a history entry). A build older than the stored one doesn't replace it.
* Renaming a package moves its entry, deleting a package removes it. A missing or broken file counts as empty.
* View: description `✓|✗|○ <date, time>`, the package icon in `testing.iconPassed|Failed|Queued`; tooltip (markdown, the package's texts as text) with the result and a link to *Open last build summary of build package* (only this command is enabled). If the build was deleted from the history, the tooltip says so and the command shows a message.

## Not in this feature

* Moving (instead of copying) sources between packages by drag and drop.


# Tests

* **Unit**
  * `BuildPackage.test.ts`: parsing, stable output, unknown keys kept, name rules (pattern, case collision, `..`, separators), branch suggestion, adding, removing and renaming sources
  * `BuildPackageStore.test.ts` (temp folder): list, create, rename, delete, add and remove sources, renaming a source in all packages, invalid JSON is not overwritten
  * `BuildScope.test.ts`: forced sources are classified as new or changed
  * `PackageLastBuilds.test.ts`: status (success, failed, incomplete, ignored sources), only package builds, newer build stays, broken file, build summary still in the history, rename and delete of a package
  * `GitChanges.test.ts` (temporary git repository): committed, not committed and untracked files below the source folder, not deleted or ignored ones, changes on the base branch after the merge base are not listed, base branch detection, invalid branch names
  * `BuildPackage.test.ts` / `BuildPackageStore.test.ts`: `archived`, the text filter, dragged sources
* **Integration**, `BuildPackages.test.ts`
  * the build list of a package contains all its sources (also unchanged ones), their dependents, and `package`; golden file `test-resources/golden/compile-list-package.json`
  * a missing source: error, no build list
  * renaming a source updates the package
  * tree items of the view; archived packages and the text filter
  * drag and drop: dragged sources, Explorer files (unsupported ones left out), drop beside a package
  * `BuildHistory.test.ts`: the build history filtered by package
  * sources of a build: all offered, the ones unchecked in the build list unchecked; path outside the workspace refused
  * last build: recorded by `write_build_history`, description, icon colour and tooltip link of the package; the command for a package never built and for a build no longer in the history
* **Backend**: `../obi-unit-tests`, the same build list as the TypeScript port for the test project.


### Definition of done
* Packages can be created, renamed, deleted and edited in the view, and built.
* The package file is stable for git and keeps unknown keys.
* Same build list with and without a local OBI.
* Docs ([building.md](../../asserts/docs/building.md), [configuration.md](../../asserts/docs/configuration.md#files-in-the-obi-folder)), l10n and CHANGELOG.
