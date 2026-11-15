# New layout of the configuration page

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟢 | finished (Unreleased; tested with unit and integration tests, rendered in Chrome in all scopes and sections with the fixture's configuration, and with screenshots in VS Code 1.114) | User request 2026-11-15: UI refresh, step 3 (mockup approved) | [ui-refresh-build-pages.md](ui-refresh-build-pages.md) |


# Current situation

* Two rows of toolkit tabs (`vscode-panels`): *Project / User / Source configuration* as large headings, below them *Configuration, Compile settings, Extended compile, System settings, Constants*.
* About 50 toolkit fields, separated by `<br/>`, with labels inside the components and the help as tooltips; the *Save* button floating at a fixed position; *There are still missing values ...* on top.
* The project tab shows two disabled fields for user and password.
* Bugs:
  * The add buttons of the global commands, compile commands, compile steps and languages, and their input fields, had the same id in the project and the user tab. `getElementById` found the project one, so in the user tab these buttons did nothing.
  * The remembered section only accepted `tab-<number>`, so *Extended compile* (`tab-2.1`) was never restored.
  * `config_general_variables.html` contained `</body></html>` in the middle of the page.
  * The add-step row of extended source processing had input fields the script never read.


# Feature

## Layout

* **Top bar** (sticky): title, switch *Project | User · profile | Sources* (`.scope-tab`, ids `project_cfg`, `user_cfg`, `source_cfg` as before), *Unsaved changes* (on the first input), the TOML file of the scope (icon), *Save*.
* Below: the description of the scope, the hint that saving rewrites the TOML file, the error banner (`#error_text`) and the banner of missing values (`#still_missing`).
* **Sections** in a list on the left (`.panel_tab`, ids `<scope>_tab-1 … tab-4`, also `tab-2.1`); one is shown (`.tab-view`). The list moves above the fields below 720 px.
* **Fields** (`config_field.html`, macro `field(key, label, …)`): label on top, *required*, the help text visible (the former tooltips), the control (`input`, `textarea`, checkbox `.obi-check`), *Required: the build can't start without it.* while empty. Two columns when there is room.
* **User scope:** each project value with *from project* (disabled, greyed) or *overridden* (blue marker as in the settings editor) and the ✎ / ↺ button, as before. The SSH user and password only exist here.
* **Project scope:** one note that user and password are set in the user configuration, instead of two disabled fields.
* **Tables** of variables, commands, compile steps and extended processing steps: aligned rows (`.kv-list`) with an add row at the end; languages and processing blocks as cards.
* *Constants* is called *Files*; "Remote ifs path" is *Project folder in the IFS*. The TOML keys are unchanged.

## Script (`config.ts`)

* Tabs: `show_tabs(panel, panel_tab)` shows the scope and the section, and the file link and description of the scope. `panel` and `panel_tab` go back to the extension with every message, as before.
* Required values: `check_input` marks the control (`missing_value`); `update_missing` sets the dots of the sections and scopes and fills the banner with a link per value (shows its section and focuses it). The section of a field comes from its `.tab-view` (no `panel` attribute any more).
* The add buttons are found by class and read the fields of their scope (`new_global_cmd_key_<scope>`, …); languages get their name from `data-language`.
* The page no longer uses the toolkit, bootstrap, bootstrap-table or jQuery; tom-select (source picker) stays, styled with the theme.
* `OBIConfiguration`: the remembered section accepts `tab-2.1`.

Saving is unchanged: the same ids and classes (`<scope>_save_app`, `type_array`, `type_dict`, `type_checkbox`, `mandatory`) and the same messages.


# Tests

* **Unit** (`Templates.test.ts`): every project value has the override button in the user scope; the button state; checkboxes that are on by default; no toolkit components; required fields marked, in the user scope only the SSH user; the ids of the add buttons and their fields exist once per page.
* **Integration** (`Secrets.test.ts`): the body attributes; *Extended compile* is remembered.
* Rendered in Chrome with the real template and script and the fixture's configuration: project scope with missing values, user scope with inherited and overridden values, compile settings, extended compile, sources. In VS Code 1.114 (screenshot): project scope.
