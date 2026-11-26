# Build list port: source variables and type steps differ from the backend

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟠 | finished (unit and integration tests; same values as the backend's formulas for all 29,517 sources of a real project) | [improvements v2.2.3 R8](../improvements/v2.2.3/README.md), [esp-conditions.md → Known differences](esp-conditions.md#known-differences-that-remain) | [esp-conditions.md](esp-conditions.md) (`fnmatch`) |


# Current situation

*Preview build* without a local OBI uses the TypeScript port (`compile_list/modules`). Compared with the backend (`properties.get_source_properties`, `app_config_tools.get_global_steps`, `build_cmds.remove_unresolved_cmd_parameters`):

* `OBJ_NAME`: the port took the name up to the first dot (`a.b.rpgle.pgm` → `a`), the backend removes the last two suffixes (`a.b`).
* `SRC_ATTR` / `SRC_TYPE`: the backend writes them in lower case, the port didn't.
* The type of a source (key of the language settings): the port took the last two parts of the whole path split at `.`, so `lib/q/x.pgm` gave `lib/q/x.pgm` and its language settings weren't found. The backend uses the last two suffixes of the file name (`pgm`).
* `$(SOURCE_DESCRIPTION)` and `$(OBJ_TEXT)` didn't exist in the port: commands using them stayed unresolved in the preview. The backend also removes `TEXT('')`, so a source without description keeps the default text.
* `[global.steps]`: the port used the first key the source name ends with (`.pgm` matched `x.rpgle.pgm`), then the last extension. The backend uses a key equal to the source name, then the first key matching the source name as a pattern (`fnmatch`), then the type.


# Fix

* [SourceName.ts](../../src/shared/SourceName.ts) (pure): `path_stem` and `path_suffixes` (pathlib), `source_type`, `object_name`, `source_attr_and_type`, `source_description` (trimmed, at most 50 characters, counted as Python does) and `escape_cl_text`.
* `getSourceProperties` ([properties.ts](../../src/extension/obi/compile_list/modules/properties.ts)) uses them and sets `SOURCE_DESCRIPTION` and `OBJ_TEXT`. `source-infos.json` is read once per build list (`BuildListContext.source_infos`); missing or invalid means no descriptions, as in the backend. Both names are stored per source in `compile-list.json` (`COMPUTED_VARIABLES`).
* `removeUnresolvedCmdParameters` also removes `TEXT('')`.
* `getGlobalSteps` ([app_config_tools.ts](../../src/extension/obi/compile_list/modules/app_config_tools.ts)): source name, then pattern (`fnmatch` from [EspConditions.ts](../../src/shared/EspConditions.ts), now compiled once per pattern), then type.


# Tests

* Unit ([SourceName.test.ts](../../src/test/unit/SourceName.test.ts)): type, `OBJ_NAME`, case, description (trim, 50 characters, emoji), escaping. [CmdParameters.test.ts](../../src/test/unit/CmdParameters.test.ts): `TEXT('')` removed, a description stays.
* Integration ([BuildList.test.ts](../../src/test/suite/BuildList.test.ts)): order of the step keys, `pgm` no longer applies to `x.rpgle.pgm`; description and `OBJ_TEXT` from `source-infos.json`, read once for two sources.
* Golden files: each source gets `SOURCE_DESCRIPTION` and `OBJ_TEXT` (empty in the fixture); nothing else changed.
* During development: the helpers against Python on 5,000 generated names and on all 29,517 sources and 27,440 descriptions of a real project.


# Known differences that remain

* Python 3.14 changed `pathlib` for names with a trailing dot: for `x..rpgle` `OBJ_NAME` is `x` with 3.14 and `x.` with 3.13 and the port. In the real project this hit 126 names, none with a buildable type; for buildable names like `x..rpgle.pgm` all give `x.`. The backend's result therefore depends on its Python version for such names.
* `use_script` and `use_shell` are only run by the backend (see [esp-conditions.md](esp-conditions.md#known-differences-that-remain)).
* TOML 0.5 (backend) vs. 1.0 (port), see there.


# Definition of done

* [x] Fix and tests
* [x] [configuration.md → Variables, Commands and steps](../../asserts/docs/configuration.md#variables), CHANGELOG
* [x] Entry R8 removed from the improvement list
