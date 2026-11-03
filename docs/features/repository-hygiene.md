# Repository hygiene and contributor guide

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | finished (`ToDo.md` and `docs/bugs2.md` still to delete) | [maintainability.md M13](../improvements/maintainability.md#m13--repository-hygiene) | – |


# Current situation

* Open items are spread over several places:
  * [ToDo.md](../../ToDo.md) (3 German bullet points),
  * [bugs2.md](../bugs2.md) (German notes on i-Releaser and OBI),
  * [open-tasks.md](../open-tasks.md),
  * [bugs.md](../bugs.md), [features/](../features/), [bugfix/](../bugfix/) and [improvements/](../improvements/).
* [architecture.md](../architecture.md#npm) refers to `technik.md#package-prüfung` for checked packages and approved exceptions. The file doesn't exist.
* There is no `CONTRIBUTING.md`: how to build, test, debug and package, the CHANGELOG rule ([architecture.md → Updates](../architecture.md#updates)), the package criteria, the spec workflow.
* The `test-workspace-active/` folder is tracked although tests overwrite it ([test-setup.md](../bugfix/test-setup.md)).


# New feature

## 1. One place for open work

* Turn the items from `ToDo.md` and `bugs2.md` into entries in `bugs.md` or spec files. Most are bugs: "Copybook-Fehler in eventf" is covered by [compile-diagnostics.md](compile-diagnostics.md); "Job CCSID wird nicht vom ESP übernommen" and "Dependency: falsche Reihenfolge bei Copybook" are new bugs. Then delete both files.
* Keep `open-tasks.md` only as a short inbox, or move its items into specs too ("Remove Transfer all" affects [remote-delete-guard.md](../bugfix/remote-delete-guard.md) and [sensitive-files-upload.md](../bugfix/sensitive-files-upload.md)).

## 2. Spec workflow (document it)

* Improvement ideas → `docs/improvements/*.md` (short, with source links).
* Implementation specs → `docs/features/` (features) and `docs/bugfix/` (bugfixes), with the header table *Type · Severity · Status · Source · Depends on*.
* Status values ([architecture.md](../architecture.md#features)): `draft` → `ready` → `finished`. Finished specs move to `docs/features/done/` / `docs/bugfix/done/`, and the improvement entry is removed.
* The index lives in [improvements/README.md](../improvements/README.md#implementation-specs).

## 3. `docs/technik.md`

Create it with the section *Package-Prüfung*: a table of checked npm packages (name, GitHub repo, stars/forks at check date, result, approved exceptions). Fill in the packages that are currently used.

## 4. `CONTRIBUTING.md`

Short sections:
* prerequisites (Node version from `.nvmrc`, VS Code version);
* `npm ci`, `npm run watch`, F5 (*Run Extension*), *Extension Tests*;
* `npm test`, `npm run lint`, `npm run typecheck`;
* packaging (`npm run package:vsix`) and release steps;
* rules from [architecture.md](../architecture.md) (security first, package criteria, native icons, Nunjucks templates, CHANGELOG) and [CLAUDE.md](../../CLAUDE.md);
* spec workflow (step 2).

## 5. Untracked and generated files

* `.gitignore`: add `out-test/`, `.vscode-test/` (exists), `temp-extensions/`, `temp-user-data/` (if still used).
* Remove `test-workspace-active/` from git together with [test-setup.md](../bugfix/test-setup.md).


## Result

* The items of `ToDo.md` and `docs/bugs2.md` are in [bugs.md](../bugs.md) (#30–#34). Both files are **still there**: `docs/bugs2.md` is not in git, so deleting it can't be undone. The owner deletes them.
* `open-tasks.md` stays as an inbox. "Add status to each feature" is done; "Remove Transfer all" and the asynchronous processing on the IBM i are open.
* Spec status values follow [architecture.md](../architecture.md#features): `draft`, `ready`, `finished`.
* `docs/technik.md` lists all runtime dependencies. `wildcard-match` failed the criteria and was replaced by `minimatch`. `winston-transport` and `@ibm/ibmi-eventf-parser` are below 200 stars: the exceptions still need approval.
* `.gitignore`: nothing to add. `out-test` and `.vscode-test/` are there, and `launch.json` uses `.vscode-test/temp-*`, not the empty `temp-extensions` and `temp-user-data` in the project root.


### Definition of done
* `ToDo.md` and `bugs2.md` items moved and the files deleted
* Spec workflow and status values documented
* `docs/technik.md` exists with the package check table
* `CONTRIBUTING.md` exists and is linked from the README
* `.gitignore` updated
