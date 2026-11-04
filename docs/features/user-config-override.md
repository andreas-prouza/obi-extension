# User config: override project values per field

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (Unreleased; unit and integration tests, page checked in a browser preview, not yet in a VS Code window) | user request 2026-11-04 | – |

Also fixes: unchecked checkboxes overriding the project config, cleared fields not being removed from the user config, defaults written into the user config, and *Activate extended source processing* turned off by saving.


# Current situation

The user config (`.obi/etc/.user-app-config*.toml`) overrides every value it sets. The extension ([DictTools.ts](../../src/shared/DictTools.ts) `override_dict`) and the OBI backend (`dict_merge` in `module/properties.py`) both use the project value when a key is missing, `''` or `[]`. `false` overrides.

The config page could not express "take this value from the project":

1. **Checkboxes** are always saved as `true` / `false` ([config.ts](../../src/webview/controller/javascript/config.ts) `save_config`), and *Save* saves the project and the user tab. Every save wrote `ssh-agent`, `ALWAYS_TRANSFER_RELATED_COPYBOOKS` and `USE_ESP` = `false` into the user config, which then overrode the project values.
2. **Cleared fields** were skipped, and `OBIConfiguration.save_config` merges the page values into the existing file. A value once set in the user config could not be removed on the page.
3. **Defaults in the user config**: `AppConfig.get_user_app_config` created `new ConfigGeneral()` when the user file had no `[general]` table. Its defaults (`source-dir = "src"`, `local-base-dir = "."`, `supported-object-types`, file locations, …) overrode the project values in the merged config and were written into the user file by the next save.
4. ***Activate extended source processing*** (`USE_ESP`) is on by default (backend: `.get('USE_ESP', True)`, extension: `app_config_tools.ts`), but the page showed it unchecked when the key was missing. Saving the project tab then wrote `USE_ESP = false`.


# New feature

## User tab: one button per value

Every value that exists in the project tab has a button in the user tab ([config_field.html](../../asserts/templates/controller/config_field.html), macro `field`):

| State | Field | Button | On save |
|---|---|---|---|
| inherited | disabled, shows the value of the project tab (also unsaved changes there) | `codicon-edit`: override | key removed from the user config |
| overridden | editable, marker on the left (`--vscode-settings-modifiedItemIndicator`) | `codicon-discard`: use the project value again | value saved; an empty value removes the key |

* The state after loading comes from the user config file: a value is overridden if it is set (`DictTools.set_paths`, same rule as `override_dict`; `false` counts as set).
* Values that only exist in the user tab (SSH user, password), language settings, variables, commands and steps have no button. Clearing such a value in the user tab removes it from the user config.
* The project tab is unchanged, apart from the wrapper element.

## Saving

* Message `save_config` has the optional field `unset`: paths like `general|source-dir` ([ConfigurationMessages.ts](../../src/shared/messages/ConfigurationMessages.ts)). Guard `is_config_path_list`: at most 1000 paths with 2–8 parts, each part a config key (no prototype keys).
* `OBIConfiguration.save_config(isUser, ws, data, unset)` removes these paths after merging `data`, only for the user config and only below `connection`, `general` and `global` (`DictTools.delete_paths`, which skips prototype keys). Tables stay, even if they become empty.
* `get_user_app_config` returns only the values of the file, without `ConfigGeneral` defaults. Defaults apply in `get_app_config` after merging.
* `USE_ESP` is shown checked unless it is `false`.

## Existing user configs

Values written by older versions (e.g. `ssh-agent = false`) appear as overridden. The page cannot tell an intended `false` from a written one, so nothing is removed automatically. The user resets them with the button.


# Tests

* Unit: `set_paths`, `delete_paths` (also prototype keys), `is_set` ([DictTools.test.ts](../../src/test/unit/DictTools.test.ts)); `is_config_path_list` ([MessageGuard.test.ts](../../src/test/unit/MessageGuard.test.ts)); every saved value of the project tab has a button in the user tab, button state, `USE_ESP` default ([Templates.test.ts](../../src/test/unit/Templates.test.ts)).
* Integration ([AppConfig.test.ts](../../src/test/suite/AppConfig.test.ts)): reset values are removed from the user file and the project value applies; an explicit `false` still overrides; the project config ignores `unset`; a user config without `[general]` doesn't override the project paths.
* Manual: user tab, override a value and reset another one, *Save*, check the user config file.


### Definition of done
* Inherited values are not written into the user config; reset values are removed
* No defaults in the user config
* German texts
* User documentation ([configuration.md](../../asserts/docs/configuration.md#project-and-user-configuration)) and CHANGELOG
