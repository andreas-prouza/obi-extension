# JSON schemas and a shared contract with the Python OBI

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | ready (schemas finished; sharing the fixtures with the Python OBI is open) | [usability.md U14](../improvements/usability.md#u14--json-files-have-no-schema), [maintainability.md M12](../improvements/maintainability.md#m12--compile-list-logic-exists-twice-typescript-and-python) | [bugfix/test-setup.md](../bugfix/test-setup.md) |


# Current situation

* `dependency.json`, `source-infos.json`, the source filter files (`.obi/source-list/*.json`) and `compile-list.json` are edited by hand or read by other tools, but have no schema. VS Code offers no completion or validation, and mistakes only show up as "Error in json file" at runtime.
* `compile-list.json` is produced by two implementations: [createBuildList](../../src/extension/obi/compile_list/) (TypeScript) and the Python OBI (`-a create`, `-a add_source`). It is read by the Python OBI (`-a run`), the build summary and the build history. Its shape is only defined implicitly, partly in [Source.ts](../../src/shared/Source.ts) and partly in [build-summary.md](build-summary.md) (`change-history`, `git`).
* The implementations have already diverged: ESP condition names ([bugs.md #7](../bugs.md#7--extended-source-processing-rules-created-by-the-ui-never-match)), git info only from TypeScript ([OBICommands.ts:410-414](../../src/extension/obi/OBICommands.ts#L410-L414)), hash of empty files ([bugs.md #15](../bugs.md#15--empty-sources-are-always-shown-as-changed)).


# New feature

## 1. Schemas

New folder `asserts/schemas/` (JSON Schema draft-07, supported by VS Code):

| Schema | Describes |
|---|---|
| `dependency.schema.json` | `{ "<source>": ["<source>", …] }` |
| `source-infos.schema.json` | `{ "<source>": { "description": string } }` |
| `source-filter.schema.json` | array of `{ "source-lib", "source-file", "source-member", "use-regex"?, "show-empty-folders"? }` |
| `compile-list.schema.json` | `timestamp`, `git`, `compiles[ { level, sources[ { source, hash?, status?, ignore?, variables?, cmds[ { cmd, status, updated?, exit-code?, stdout?, stderr?, joblog?, ignore?, properties?, change-history? } ] } ] } ]`, `config?`, `custom_data?` |

Source keys get a `pattern` (lib/file/member.ext) and the descriptions explain each field (shown on hover).

## 2. Register for editing

```json
"jsonValidation": [
  { "fileMatch": "**/.obi/etc/dependency.json",                   "url": "./asserts/schemas/dependency.schema.json" },
  { "fileMatch": "**/.obi/etc/source-infos.json",                 "url": "./asserts/schemas/source-infos.schema.json" },
  { "fileMatch": "**/.obi/source-list/*.json",                    "url": "./asserts/schemas/source-filter.schema.json" },
  { "fileMatch": ["**/.obi/build-output/compile-list.json", "**/.obi/build-history/*/compile-list.json"],
    "url": "./asserts/schemas/compile-list.schema.json" }
]
```

The paths of `dependency-list` and `source-infos` are configurable. The associations only cover the defaults; document that.

TOML files: VS Code has no built-in TOML schema support. Optionally provide `app-config.schema.json` and document the `#:schema` directive for the *Even Better TOML* extension. Not part of the definition of done.

## 3. Contract tests

* Folder `test-resources/contract/<case>/` with an input project (sources, config, `dependency.json`, `object-builds.json`) and the expected `compile-list.json` (without `timestamp` / `git`).
* TypeScript test: run `createBuildList` for each case, validate the result against `compile-list.schema.json` (with `ajv` as dev dependency, check the [criteria](../architecture.md#npm)), and compare with the expected file.
* Python OBI: the same fixtures are used in its test suite (copy, or a shared repository / git submodule). Agree on the mechanism with the Python OBI project.
* The schemas and fixtures are the reference when the behaviour of the two implementations differs. Differences become bugs in the one that deviates.

## 4. Types from the schema (optional)

Generate TypeScript types for `compile-list.json` from the schema (e.g. `json-schema-to-typescript`, if it meets the criteria) and use them instead of `any` in `OBITools.get_compile_list` and friends (pairs with [strict-typescript.md](strict-typescript.md)).


## Status

* Finished: the four schemas in [asserts/schemas](../../asserts/schemas), registered with `jsonValidation`. An integration test confirms that VS Code reports a mistake in `dependency.json`.
* The schemas allow additional keys and don't restrict `status`, because two implementations write these files; a newer Python OBI must not cause errors in the editor. `status` values are offered as `examples`.
* Contract: the build list golden test ([BuildListGolden.test.ts](../../src/test/suite/BuildListGolden.test.ts), `test-resources/golden/compile-list.json`) is the fixture with the expected output, and a unit test validates it against the schema (`ajv`, development dependency).
* **Open:** agreement with the Python OBI to use shared fixtures (step 3), so the folder `test-resources/contract/<case>` isn't created yet. Types generated from the schema (step 4, optional) and the TOML schema are not done.


# Tests

* Opening the test project's JSON files in VS Code shows no schema errors; an invalid entry shows a red squiggle.
* Contract tests pass.


### Definition of done
* Schemas for the four file types, registered via `jsonValidation`
* Contract fixtures + TypeScript test validating schema and expected output
* Agreement with the Python OBI on using the fixtures (recorded)
* CHANGELOG entry
