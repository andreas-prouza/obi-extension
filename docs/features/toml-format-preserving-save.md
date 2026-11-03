# Keep comments and layout when saving TOML from the UI

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | ready (phase 1 finished, phase 2 needs a decision) | [reliability.md R4](../improvements/reliability.md#r4--saving-through-the-ui-drops-comments-in-toml-files) | [bugfix/config-overwrite-on-parse-error.md](../bugfix/config-overwrite-on-parse-error.md), [bugfix/swallowed-write-errors.md](../bugfix/swallowed-write-errors.md) |

Related: [bugfix/config-migration-on-fresh-clone.md](../bugfix/config-migration-on-fresh-clone.md) (inserts a key without re-serializing).


# Current situation

`DirTool.write_toml` ([DirTool.ts:341-361](../../src/extension/utilities/DirTool.ts#L341-L361)) serializes the whole object with `smol-toml`. Every save from the config page, the source config page or the ESP editor rewrites the file:
* comments disappear (the template [app-config.toml](../../obi-media/.obi/etc/app-config.toml) contains several, e.g. `#remote-host`, `#INCLUDE_BNDDIR`, `#prouzalib = "prouzat1"`);
* tables and keys are reordered, and quoting/array layout change;
* git diffs of a one-value change touch the whole file.

Writers: `OBIConfiguration.save_config` and the `add_*` / `delete_*` handlers (app and user config), `OBISourceConfiguration` (`source-config.toml`), `OBIConfiguration.add/delete_source_config`, `SourceListProvider.sync_renamed_source_member`, `ExtendedSourceProcessingList.save_to_file`, `DeploymentConfig.save_config`.


# New feature

## Phase 1: make the behaviour visible

* Config page and source config page: a short hint next to the *Save* button: "Saving rewrites the TOML file; comments are not kept."
* [configuration.md](../../asserts/docs/configuration.md): same note, and the recommendation to keep explanations in the docs rather than in comments.

## Phase 2: change only what changed

### Library first

Check whether a TOML library with format-preserving edits meets the [package criteria](../architecture.md#npm) (GitHub repo, several forks, ≥ 200 stars). If one does, use it and skip the own editor below. If none does: **ask** before implementing the own editor (as required by architecture.md).

### Own minimal editor (if no library qualifies)

New module `src/extension/utilities/TomlPatch.ts`:

```ts
export type TomlChange =
  | { op: 'set'; table: string[]; key: string; value: TomlValue }
  | { op: 'delete'; table: string[]; key: string }
  | { op: 'delete-table'; table: string[] };

/** Applies changes to the original text. Throws TomlPatchUnsupported if a change can't be applied safely. */
export function apply_toml_changes(original: string, changes: TomlChange[]): string

/** Changes needed to turn `before` into `after` (both parsed objects). */
export function diff_toml(before: object, after: object): TomlChange[]
```

* A line scanner tracks the current table header (`[a.b]`, `[a."sqlrpgle.pgm"]`) and finds `key = …` lines, including quoted keys.
* `set` replaces the value part of an existing single-line entry and keeps a trailing comment. A missing key is appended at the end of its table, and a missing table at the end of the file.
* `delete` removes the line; `delete-table` removes the header and its entries up to the next header.
* Values are serialized with `smol-toml` (`stringify({ x: value })` → take the right-hand side).
* **Unsupported:** multi-line values (multi-line arrays or strings), inline tables, arrays of tables (`[[…]]`), keys defined via dotted keys in another table. Then `apply_toml_changes` throws, and the caller falls back to the full rewrite, but only after creating `<file>.bak` and showing a warning ("Comments in app-config.toml could not be kept; a backup was written").
* Verify every result: `parse(result)` must deep-equal `after`; otherwise fall back as above.

### Use it

`DirTool.update_toml(file, after)`: read the original, `diff_toml(parse(original), after)`, `apply_toml_changes`, verify, write atomically. All writers listed above use `update_toml` instead of `write_toml`.


## Status

* Phase 1 done: hint on the configuration page and the source configuration page, note in configuration.md.
* Phase 2, library check (2026-10-24): no package meets the criteria. [`@decimalturn/toml-patch`](https://github.com/DecimalTurn/toml-patch) does exactly this (`patch(existing, updated)`), but has 9 stars and 1 fork; `timhall/toml-patch` 8 stars; `@ltd/j-toml` 59; `toml-eslint-parser` 26; Taplo (2,400 stars) only formats from JS, it can't patch values. **Decision needed:** own minimal editor as described below, an exception for `@decimalturn/toml-patch`, or phase 1 only.


# Tests

Round-trip tests on the template `app-config.toml` and the test-resources configs:
* change one value → only that line differs (line diff) and all comments remain;
* add a language section (`[global.settings.language."x.pgm"]`) → appended, rest unchanged;
* delete a global command → one line removed;
* change a multi-line array → fallback with `.bak` + warning;
* `parse(result)` deep-equals the expected object for every case.


### Definition of done
* Phase 1 hint in the UI and docs
* Phase 2: library chosen per criteria, or own editor approved and implemented
* Saving from the UI keeps comments and order for all supported cases; unsupported cases fall back with a backup and a warning
* Round-trip tests pass; CHANGELOG entry
