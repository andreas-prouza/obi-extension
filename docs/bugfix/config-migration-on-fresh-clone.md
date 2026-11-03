# Migrations rewrite the project config on every fresh clone

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🔴 | finished (differing Python config files are replaced only on request, instead of automatically with backup) | [reliability.md R1](../improvements/reliability.md#r1--migrations-run-again-on-every-fresh-clone-and-rewrite-the-project-config) | [swallowed-write-errors.md](swallowed-write-errors.md) (atomic write) |

Related: [features/toml-format-preserving-save.md](../features/toml-format-preserving-save.md).


# Current situation

`OBITools.self_check()` ([OBITools.ts:107-140](../../src/extension/utilities/OBITools.ts#L107-L140)) decides which migrations to run by comparing the extension version with `workspaceState.get('obi.version')`:

| Condition (`major·minor·patch` padded) | Action |
|---|---|
| `<= 208` | overwrite `.obi/etc/constants.py` and `logger_config.py` |
| `<= 221` | rewrite `app-config.toml` with `compiled-object-list`, `remote-source-list`, `source-list`, `dependency-list` set to the code defaults |
| `<= 324`, `<= 607` | overwrite `constants.py` |

`workspaceState` is stored per machine and per workspace path. For a fresh clone, a second PC, a moved folder or cleared state, the value is `undefined` → `0`, so **all** steps run:
* `app-config.toml` (a committed file) is re-serialized by `smol-toml`: comments and ordering are lost;
* the four paths are reset to defaults. The template uses `source-list = ".obi/etc/source-list-local.json"`, the default is `.obi/etc/source-list.json`;
* local changes in `constants.py` / `logger_config.py` are overwritten without notice.

`self_check()` is also called on every *Show changes* ([OBICommands.ts:375](../../src/extension/obi/OBICommands.ts#L375)), but the version is updated right after the first run, so in practice the migration runs once per machine.


# Fix

## 1. Store the project schema version in the project

* New constant `Constants.OBI_PROJECT_SCHEMA_VERSION = 1` (bump with every future migration).
* Store it in a new committed file `.obi/etc/obi-project.json`:
  ```json
  { "schema-version": 1 }
  ```
  A separate file is used instead of a key in `app-config.toml` so that (a) it can be written without touching the TOML (no comment loss, see R4), and (b) the Python OBI doesn't see an unknown config key. See the open questions.
* Remove the use of `workspaceState` `obi.version` for migration decisions.

## 2. Make the legacy migrations non-destructive

Move the migrations out of `self_check()` into `src/extension/obi/ProjectMigration.ts`:

```ts
export interface MigrationResult { changed_files: string[]; backups: string[]; }
export async function migrate_project(ws: string, ext_media_dir: string): Promise<MigrationResult>
```

Run it once at activation (not on every *Show changes*). For a project without `obi-project.json` (= schema 0):
* **Paths step (old `<= 221`):** set each of the four keys **only if it is missing or empty**. Never overwrite a present value. If nothing is missing, don't write `app-config.toml` at all. If something must be added, insert the line(s) into the `[general]` table in the original text (string insert after the `[general]` header line) instead of re-serializing the whole file.
* **`constants.py` / `logger_config.py`:** compare the content with the file shipped in `obi-media`.
  * Identical → nothing to do.
  * Different → copy the current file to `<name>.bak-<yyyymmdd-hhmmss>` and replace it. List both in the result.
* Write `obi-project.json` with the current schema version.

## 3. Tell the user

If `changed_files` isn't empty, show one information message:

> OBI updated project files to schema version 1: `app-config.toml`, `constants.py` (backup: `constants.py.bak-20261022-101500`). Please review and commit them.

Buttons: `Show changes` (opens the SCM view) / `OK`.

## 4. Future migrations

Every future migration becomes a numbered step `migrate_<n>_to_<n+1>()`, runs only when `schema-version < n+1`, and must be idempotent.


# Open questions

* Could the schema version be stored in `app-config.toml` (`[general] obi-schema-version`) instead? Only if the Python OBI ignores unknown keys. Check that before deciding; the separate JSON file avoids the question.


# Tests

Fixture-based unit tests for `migrate_project`:
* project without `obi-project.json` and with all four paths set → `app-config.toml` byte-identical, `obi-project.json` created;
* project with `source-list` missing → only that line added, comments preserved;
* modified `constants.py` → backup created, file replaced, both reported;
* project with `obi-project.json` at the current version → no file touched.


### Definition of done
* Migration decisions are based on `.obi/etc/obi-project.json`, not on `workspaceState`
* Opening an already migrated project on a new machine changes no file (verified with `git status`)
* Legacy migration never overwrites present config values and preserves comments in `app-config.toml`
* Python config files are backed up before replacement
* The user is informed about changed files
* `obi-project.json` is part of the `obi-media` template
* Unit tests pass; CHANGELOG entry
