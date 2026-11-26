# Extended source processing: conditions match differently in the preview and in the backend

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🔴 | finished (unit and integration tests; same counts as Python `fnmatch` on a real project with 29,517 sources and 6 rules; backend tests in `../obi-unit-tests`) | [improvements v2.2.3 R2](../improvements/v2.2.3/README.md), [bugs.md #7](../bugs.md#7--extended-source-processing-rules-created-by-the-ui-never-match) | – |

Repositories: `obi-extension` (TypeScript port of the build list), `../obi` (backend), `../obi-unit-tests`.


# Current situation

The backend's rule ([extended-source-processing.md → Conditions](https://github.com/andreas-prouza/obi/blob/main/docs/extended-source-processing.md#conditions)): the name of a condition is a variable of the source; a **string** is compared with the value of that variable, a **list** with the source name, whatever the name is. Real projects depend on the list rule: `SOURCE_FILE_NAME = ["all_*.pgm", "mylib/*.pgm"]` matches thousands of sources compared with the source name, and none compared with the value of `SOURCE_FILE_NAME` (it starts with `src/`).

The TypeScript port (`matchSourceConditions` in `compile_list/modules/app_config_tools.ts`, used by *Preview build* without a local OBI) differed:

* It only knew `SOURCE_FILE_NAMES` (a list, compared with the source name) and `TARGET_LIB`. Every other name failed the rule, so the form the configuration page writes (`SOURCE_FILE_NAME`) never matched. `SOURCE_FILE_NAMES` in turn is no variable, so the backend never matched it. The tests (`BuildList.test.ts`, the golden test) used `SOURCE_FILE_NAMES`.
* `minimatch` with `matchBase` instead of `fnmatch`: `*` stopped at `/`, and patterns without `/` were compared with the file name only.
* `new RegExp` without error handling.
* Project and user ESP rules were merged. The backend uses the user file *instead of* the project file when it has content.
* `convert_dict_to_ESP` turned a step given by name (`steps = ["global.cmds.x"]`) into an empty step: only the default steps ran.

Backend: in a list with `use_regex = true`, an entry that didn't match as an expression was also tried as a pattern (missing `else`). A string condition on a variable that is a list or `true`/`false` stopped the build list with a `TypeError`, and an invalid regular expression gave a bare `re.error`. `fnmatch.fnmatch` ignores case on Windows.


# Fix

Both implementations follow the documented rule. Edge cases are decided the same way on both sides:

| Case | Rule |
|---|---|
| Name is no variable of the source | No match; the port logs it once per build list (not once per source) |
| String condition | Compared with the variable if it is text or a whole number, otherwise no match |
| List condition | Compared with the source name; entries that are not text are skipped |
| Pattern (`use_regex = false`) | Python `fnmatch`: whole value, `*` also matches `/`, `?`, `[abc]`, `[!abc]`, reversed ranges dropped; case-sensitive |
| `use_regex = true` | Found anywhere (`re.search`); never also tried as a pattern |
| Invalid expression | Error naming condition and expression |

* Extension:
  * [EspConditions.ts](../../src/shared/EspConditions.ts) (pure): `fnmatch_regex` (port of `fnmatch.translate`, compiled once per pattern) and `match_conditions`. `matchSourceConditions` uses it.
  * `getActiveExtendedSourcesConfig`: the user file if it has content (`ExtendedSourceProcessingList.has_content`: any TOML key, also `extended_source_processing = []`), otherwise the project file.
  * `convert_dict_to_ESP`: a step name becomes `{ step, add_default_steps: false }`.
  * Configuration page: hint under *Conditions*, placeholder `{"SOURCE": ["mylib/*.pgm"], "OBJ_NAME": "ord*"}`, a new rule starts with `{"SOURCE": ["*"]}`.
* Backend (`module/app_config_tools.py`): `match_source_conditions` with `condition_text` and `match_pattern` (`fnmatch.fnmatchcase`, `re.search` with a clear error). Docs and CHANGELOG of the backend updated.

Not changed: the list rule itself, and `SOURCE_FILE_NAMES` (now unknown on both sides, as it always was in the backend).


# Tests

* Unit ([EspConditions.test.ts](../../src/test/unit/EspConditions.test.ts)): the cases of `TestConditions` in `../obi-unit-tests`, plus types of values and `fnmatch` edge cases. During development `fnmatch_regex` was also compared with Python `fnmatch.fnmatchcase` on 20,036 patterns (no difference).
* Integration ([BuildList.test.ts](../../src/test/suite/BuildList.test.ts)): user file replaces the project file (missing, only a comment, rules, empty list); the project form `SOURCE_FILE_NAME = [...]`; a step given by name.
* Golden: `compile-list-package.json` changed. The fixture's ESP rule (`SOURCE_FILE_NAME = ["*"]`, `TARGET_LIB = ["*"]` → `TARGET_LIB = "PROUZALIB"`) now applies, as it always did in the backend.
* Backend (`../obi-unit-tests/tests/test_extended_source_cmds.py`): list compared with the source name for any name, list entries that are not text, regex not tried as a pattern, invalid regex, case, whole numbers, lists/`true`/decimals. They fail on the old code.


# Known differences that remain

Not part of this fix:

* Fixed later in [source-variables-port.md](source-variables-port.md): `OBJ_NAME` of names with more dots, the case of `SRC_TYPE` / `SRC_ATTR`, `SOURCE_DESCRIPTION` / `OBJ_TEXT`, and the steps per source type.
* `use_script` and `use_shell` are only run by the backend; the port checks such rules by their conditions only.
* The backend reads TOML 0.5 (`toml` package): a list with mixed types makes the whole file empty there, the port (TOML 1.0) reads it.


# Definition of done

* [x] Fix in both repositories, tests in all three
* [x] Docs: [configuration.md → Extended source processing](../../asserts/docs/configuration.md#extended-source-processing), backend `docs/extended-source-processing.md`; both CHANGELOGs
* [x] bugs.md #7 marked fixed, R2 removed from the improvement list, remaining differences listed there
