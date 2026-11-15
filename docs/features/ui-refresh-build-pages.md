# New layout of the build summary and the OBI Build view

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟢 | finished (Unreleased; tested with integration tests, in Chrome with the colours of the Dark Modern theme, and with screenshots in VS Code 1.114) | User request 2026-11-15: the pages look old | [i-releaser-status-card.md](i-releaser-status-card.md), [dependency-hygiene.md step 4](dependency-hygiene.md#4-replace-the-deprecated-webview-toolkit) |

Step 1 of the UI refresh. Next: welcome and "invalid config" views as `viewsWelcome`, the configuration pages (with `@vscode-elements/elements`), the source filter table.


# Current situation

* **Build summary:** a row of creation time, two underlined links and buttons spaced with `&nbsp;`; three centred bullet lists; "Details" with host and IFS path; a table whose commands open inside the last column; toolkit buttons and checkboxes; Bootstrap's 16 px font.
* **OBI Build view:** radio buttons `*CURRENT` / `*ALL`, two 60 px icon buttons without text, a toolkit dropdown with two blue square buttons, a progress ring while something runs.
* Both use components of the deprecated `@vscode/webview-ui-toolkit`.


# Feature

## Shared stylesheet

* `asserts/css/ui.css` (`global_stuff.ui_style_uri`): colours only from theme variables (with fallbacks); buttons (`.btn`, `.secondary`, `.small`, `.full`), icon buttons (`.icon-btn`), checkbox (`.obi-check`, a native checkbox drawn like VS Code's), status pills, the deployment card (moved from `style.css`), page header, tiles, build list, and the parts of the OBI Build view.
* `body.obi-page` uses `--vscode-font-size` (13 px) instead of Bootstrap's 16 px.
* The other pages move to it one by one.

## Build summary

* **Header:** title; pills *n failed*, *n built*, *n to build*; actions *Run build* / *Start i-Releaser workflow*, *Add source*, icon links for the JSON file and the OBI log. Meta line: creation time, user@host, IFS path, git branch · commit (7 characters) of the build list. A custom template is included below it.
* **Tiles:** new, changed, dependent sources: count, the first three as links (library and source file in grey), the rest in a `<details>` (*+ n more*, state kept).
* **Build list** (`table#details`):
  * Level rows (`.collapsible-header`): *n. level · n objects* and the result (✓ ✗ ○); a click folds the level (class `level-hidden`, kept in the UI state as before).
  * Source rows: checkbox (`build_source`), member name highlighted, status pill, *n commands* (singular *1 command*).
  * The commands in their own row below (`.cmds-row`, `hidden`). Open at first for failed sources (`data-default-open`), then as the user left them (UI state `commands_open`).
  * Each command: checkbox (`build_source_cmd`), status icon, time or *not run*, the command; a `<details>` with the full command, one part per line, and a copy button (`navigator.clipboard`). A failed command is marked red and open. Edit, *Joblog*, *Spool*, *Error* as small buttons; their classes and attributes are the old ones, so the handlers stay.
* `annotate_build_list` (`src/shared/BuildListView.ts`) sets the status of every source (the last command that ran, as the template did) and the counts per level and in total.

## OBI Build view

* **Switch** *Current source* / *All changes* (`#opt_run_type`, `data-value` `single` / `all`, kept in the view state). With *Current source*, the name of the source of the active editor (`current_source`, sent when the editor changes; *No source open* otherwise).
* *Run build* and *Show changes* as full-width buttons with text.
* **While an operation runs** (`running_state`, as before): the buttons are replaced by a box with its name, the elapsed time, a progress line and *Cancel*; switch and profile are dimmed. `#running_ring` keeps its id and attributes.
* **Profile:** a native `<select>` in the colours of a VS Code dropdown; ➕ and 🗑 as icon buttons.
* **Last build:** time and result of the current build list (*Last build 10:40 · 1 of 8 failed*, *· all 3 built*, *Build list … · 5 to build*) with **Open** (new message `open_build_summary` → `obi.open_build_summary`).

## Not done

* The toolkit is still imported by the build summary script: custom build summary templates may use its components.


# Tests

* **Unit** (`BuildListView.test.ts`): `source_status`, `is_failed_status`, `annotate_build_list`.
* **Integration:**
  * `BuildSummaryPage.test.ts`: header pills and meta, counts and singular/plural, status of a source, commands open for a failed source, output buttons, *not run*, no toolkit components, the empty state.
  * `OBIController.test.ts`: busy state as a body class, no toolkit components and the switch, the last build in all three cases and without a build list, *No source open*, **Open**.
  * `IReleaserDeployment.test.ts`: the card buttons as plain buttons.
* Rendered in Chrome with the real templates and stylesheets (dark theme, also with a narrow editor for the card).
* Screenshots in VS Code 1.114 found two problems the Chrome renders didn't show, both fixed: the profile dropdown was empty for the default profile (its alias `undefined` selected nothing), and VS Code's webview CSS gave `<code>` a background.
