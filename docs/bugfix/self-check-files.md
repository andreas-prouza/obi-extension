# self_check: default source filter never copied, wrong default file names

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟡 | finished (integration tests in SelfCheck.test.ts) | [improvements v2.2.3 R6](../improvements/v2.2.3/README.md) | – |


# Current situation

`OBITools.self_check` ([OBITools.ts](../../src/extension/utilities/OBITools.ts)) runs on activation and every config change (`ProjectState.update`) and creates missing project folders and files.

* The filter folder `.obi/source-list` was created by an early check. A later branch, meant to create it *and copy the default filter `All sources.json`* from `obi-media`, therefore never ran. *Initialize* copies the whole template, so this only hit projects whose folder was missing otherwise (e.g. older projects): they got an empty Source filters view.
* Default file names when the config has no value: `source-infos.json` in the project folder (the readers use `.obi/etc/source-infos.json`), `dependency.json` in the project folder and `object-build.json` (no `s`). The last two keys have defaults in `AppConfig`, `source-infos` has none.


# Fix

* One branch: if the filter folder doesn't exist, it is created and `All sources.json` is copied. An existing folder, also an empty one, is left alone: `self_check` runs on every config change and must not bring back a filter the user deleted. (A folder deleted while VS Code runs is recreated empty by `HealthyWatchdog`, as before.)
* The three JSON files fall back to `Constants.SOURCE_INFOS`, `DEPENDENCY_LIST` and `COMPILED_OBJECT_LIST`. The other fallbacks for `source-infos` (`LocalSourceList`, `SourceInfos`) use the constant too.

Not changed: `self_check` still validates and creates files in one function. Creating is idempotent (only missing files), so splitting it would change no behaviour.


# Tests

Integration ([SelfCheck.test.ts](../../src/test/suite/SelfCheck.test.ts)):

* Missing filter folder → created with `All sources.json`, same content as in `obi-media`.
* Existing empty folder → stays empty.
* No `source-infos` in the config → `.obi/etc/source-infos.json` is created, nothing in the project folder.


# Definition of done

* [x] Fix and tests
* [x] CHANGELOG
* [x] Entry R6 removed from the improvement list
