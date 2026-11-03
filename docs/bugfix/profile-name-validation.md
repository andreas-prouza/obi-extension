# Profile names are not validated

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟡 | finished | [security.md S12](../improvements/security.md#s12--profile-names-allow-path-traversal) | – |


# Current situation

* `OBIController.copy_current_profile` ([OBIController.ts:266-297](../../src/webview/controller/OBIController.ts#L266-L297)) only rejects empty and existing names. Inside `validateInput` it replaces the first space and `.toml` for the duplicate check, but the **unmodified** input is used to build the file name.
* The alias becomes part of a file name in `AppConfig.convert_profile_alias_to_file` ([AppConfig.ts:443-445](../../src/extension/config/AppConfig.ts#L443-L445)) and `ExtendedSourceProcessingList.convert_profile_alias_to_file` ([EspConfig.ts:88-90](../../src/extension/config/EspConfig.ts#L88-L90)). An input of `../../x` writes outside `.obi/etc`.
* `Workspace.change_profile` accepts any string from the webview message `change_profile` ([OBIController.ts:243-245](../../src/webview/controller/OBIController.ts#L243-L245)) and from `workspace-settings.json`.


# Fix

## 1. Rules

New in `src/shared/Profile.ts`:

```ts
/** Allowed for newly created profiles. */
export const NEW_PROFILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** A profile alias is usable if it's the default ('') or one of the existing profile files. */
export function is_known_profile(alias: string): boolean {
  return alias === '' || AppConfig.get_profile_app_config_list().some(p => p.alias === alias);
}
```

The strict pattern applies only to **new** profiles. Existing aliases that were created with other characters (e.g. spaces) keep working because they are checked against the list of existing files.

## 2. Creating a profile

In `copy_current_profile`:
* `validateInput`: return an error unless `NEW_PROFILE_PATTERN.test(value)` ("Use letters, digits, `-` and `_` only") or if it already exists.
* Use exactly the validated value for the file name.
* Return quietly on cancel (see [input-cancel-shows-error.md](input-cancel-shows-error.md)).

## 3. Selecting a profile

* `Workspace.change_profile(alias)`: if `!is_known_profile(alias)`, log a warning, show "Unknown profile '<alias>'", and do not write `workspace-settings.json`.
* `AppConfig.get_current_profile_app_config_name()` and `ExtendedSourceProcessingList.get_current_profile_config_name()`: if the alias stored in `workspace-settings.json` is not known, fall back to the default profile and log a warning.

## 4. File name helpers

`convert_profile_alias_to_file` (both places) throws if the alias contains `/`, `\`, `..` or NUL. That is the last line of defense, and it should never trigger after steps 2–3.


# Tests

* `NEW_PROFILE_PATTERN`: accepts `prod`, `dev-1`, `my_profile`; rejects `../x`, `a/b`, `a b`, `.hidden`, `` (empty), 65 characters.
* `is_known_profile` with a fixture `.obi/etc` containing `.user-app-config-old name.toml`: accepts `old name`, rejects `../x`.


### Definition of done
* New profiles can only use `[A-Za-z0-9_-]` (first character alphanumeric)
* Selecting a profile only accepts known aliases; unknown aliases from `workspace-settings.json` fall back to the default profile with a warning
* File name helpers reject path separators and `..`
* Unit tests pass
* CHANGELOG entry
