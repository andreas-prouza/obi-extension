# A TOML syntax error plus one UI save wipes the config file

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🔴 | finished (refusal implemented centrally in `DirTool.update_json` / `update_toml`; no warning for old `source_name` artefacts yet) | [reliability.md R2](../improvements/reliability.md#r2--a-toml-syntax-error-plus-one-save-in-the-ui-wipes-the-config-file) | – |

Implement together with [swallowed-write-errors.md](swallowed-write-errors.md) (same functions in `DirTool`).


# Current situation

## Read errors look like empty files

`DirTool.get_toml()` ([DirTool.ts:315-338](../../src/extension/utilities/DirTool.ts#L315-L338)) returns `undefined` both when the file is missing and when it can't be parsed. It only logs parse errors. Callers then start from an empty object and **write the result back**:

| Caller | Fallback | Written file |
|---|---|---|
| `OBISourceConfiguration.save_config / add_source_cmd / add_source_setting / delete_*` ([OBISourceConfiguration.ts:180-266](../../src/webview/controller/OBISourceConfiguration.ts#L180-L266)) | `get_source_configs()` → `undefined` → new object | `source-config.toml` |
| `OBIConfiguration.add_source_config / delete_source_config` ([OBIConfiguration.ts:399-412](../../src/webview/controller/OBIConfiguration.ts#L399-L412)) | `|| {}` | `source-config.toml` |
| `OBIConfiguration.save_config` ([OBIConfiguration.ts:417-479](../../src/webview/controller/OBIConfiguration.ts#L417-L479)) | `get_user_app_config` → `new AppConfig(undefined, …)` (defaults) | user / project `app-config` |
| `SourceListProvider.sync_renamed_source_member` | writes only if found (OK) | – |

So after one typo in a hand-edited `source-config.toml`, the next save in the source config page replaces the file with just that one source.

The same pattern exists for JSON: `DirTool.get_json()` returns `undefined` on parse errors, and e.g. `SourceListConfig.add_filter`, `SourceInfos.save_infos` and `DependencyList.load_dependencies` continue with `[]` / `{}` and write back.

## Literal object keys

[OBISourceConfiguration.ts:212-216](../../src/webview/controller/OBISourceConfiguration.ts#L212-L216), [233-237](../../src/webview/controller/OBISourceConfiguration.ts#L233-L237), [259](../../src/webview/controller/OBISourceConfiguration.ts#L259):

```ts
let source_config: SourceConfig = {"source-cmds": {key: value}, settings: {}, steps: []};
...
source_configs = {source_name : source_config};
```

`{key: value}` and `{source_name: …}` create properties literally named `key` / `source_name`. In normal use the webview sends `save_config` before `add_*`, which hides this. When the file is missing or unreadable, it writes `[source_name]` / `key = …` into `source-config.toml`.


# Fix

## 1. Typed read result

Add to `DirTool`:

```ts
export class ConfigFileError extends Error {
  constructor(public readonly file: string, public readonly line: number | undefined,
              public readonly column: number | undefined, message: string) {
    super(`${file}${line ? `:${line}:${column ?? 0}` : ''}: ${message}`);
  }
}

/** undefined = file does not exist. Throws ConfigFileError if the file exists but can't be parsed. */
public static read_toml_strict<T>(file: string): T | undefined
public static read_json_strict<T>(file: string): T | undefined
```

* smol-toml parse errors carry `line` and `column`; JSON errors carry the position in the message.
* Keep `get_toml` / `get_json` for read-only callers (views), but implement them on top of the strict versions (catch, log, show the error once, return `undefined`).

## 2. Read-modify-write only with strict reads

Every function that reads a file, modifies it and writes it back uses the strict reader. If it throws, show:

> `source-config.toml` line 12, column 5: Invalid TOML … — nothing was saved. Fix the file and try again.

with a button `Open file` (opens the file at that position), and **don't write**. Affected: all callers in the table above, plus `DependencyList.save_dependency_list` callers, `SourceListConfig.add_filter/delete_filter`, `SourceInfos.save_infos`, `LocalSourceList.update_source_infos`, `ExtendedSourceProcessingList` (constructor + `save_to_file`), `OBITools.rename_source_in_object_list`.

## 3. Computed keys

```ts
let source_config: SourceConfig = { "source-cmds": { [key]: value }, settings: {}, steps: [] };
source_configs = { ...(source_configs ?? {}), [source_name]: source_config };
```

Apply to `add_source_cmd`, `add_source_setting` and `save_config`. Never replace the whole object when only one source changes.

## 4. Repair existing files

On load of `source-config.toml`, if a top-level table named exactly `source_name` exists (an artefact of the bug), log a warning and show "source-config.toml contains an entry 'source_name' created by an older OBI version. Please review it." Don't change it automatically.


# Tests

* Fixture with a syntax error in `source-config.toml`: `OBISourceConfiguration.save_config(...)` throws/reports and the file content is unchanged (byte-compare).
* Missing `source-config.toml`: `add_source_setting('A', 'x')` for source `lib/qrpglesrc/a.rpgle.pgm` creates `["lib/qrpglesrc/a.rpgle.pgm".settings] A = "x"` — no `source_name`, no `key`.
* `read_toml_strict` returns `undefined` for a missing file, throws `ConfigFileError` with line/column for an invalid one.


### Definition of done
* No code path writes a config/JSON file after failing to parse it
* Parse errors are shown with file, line and column and an *Open file* action
* No literal `key` / `source_name` properties in `OBISourceConfiguration`
* Warning for existing `source_name` artefacts
* Unit tests pass; CHANGELOG entry
