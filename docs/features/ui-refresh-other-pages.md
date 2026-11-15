# The remaining pages in the new style

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟢 | finished (Unreleased; tested with unit and integration tests and rendered in Chrome with the real templates, scripts and sample data, not looked at in VS Code itself) | User request 2026-11-15: UI refresh, step 4 | [ui-refresh-config-page.md](ui-refresh-config-page.md) |


# Current situation

The forms besides the configuration page still used toolkit components, `<br/>` for spacing, a floating *Save* button, and bootstrap tables in Bootstrap's colours:

* Individual build settings of a source (`config_source_details.html`), deployment config (`deployment-config.html`), source filter config (`source-filter-config.html`), source dependencies (`maintain-source-dependency.html`), source infos (editor and view), the source filter table (`source_list/index.html`), the hidden quick settings view.

Bugs found on the way:

* Source filter config: the checkbox *Empty folder* of the add row had the id `show_empty_folders`, the script read `new_show_empty_folders`: the value was always `false`.
* Source dependencies: *Save* had no handler (add and delete save right away). The first delete button had a broken attribute (`source='…''`).
* Source infos view: a *Save* button that sent an empty list (harmless: the extension merges).
* bootstrap-table draws its toolbar buttons with bootstrap-icons (`bi-*`), which were removed from the project: the buttons were empty.
* Text filters of bootstrap-table (`data-filter-control="input"`) compare with the raw cell HTML. A source's cell is a link whose `href` holds the full file path, the descriptions of the source infos editor are inputs with `data-lib` etc.: a filter like "test" matched every row when the project path contained it.


# Feature

* Same frame as the configuration page (`asserts/css/ui.css`): `.cfg-bar` with the title, the file or source, *Unsaved changes* and *Save* (only where the page saves on demand), `.cfg-sub` with a short explanation, one column `.cfg-single`.
* Settings, commands and filters as aligned rows (`.kv-list`, variants `.kv-filter`, `.kv-deps`); native inputs, text areas, checkboxes, selects.
* Pages that save right away say so (dependencies: "Changes are saved right away", source infos: "A description is saved when you leave its field") and have no *Save* button.
* bootstrap-table stays (sorting, filters, paging), with Bootstrap's variables set from the theme (`.obi-bt`). `prepare_tables()` in `tools/javascript/bootstrapTable.ts` runs before the tables are created: it sets the icons to codicons and registers `obi_cell_text_search`, which the input-filter columns use (`data-filter-custom-search`). It compares the visible text of a cell (the value of an input, else the text content), case-insensitively.
* Ids, classes and messages are the old ones, apart from the fixed add-row checkbox and the ids of the source settings rows (`setting|<key>`, `cmd|<key>` instead of the same `<key>|value` for both; no script reads them).
* No page template uses `<vscode-…>` any more (unit test). The build summary script still imports the toolkit, because custom build summary templates may use its components.


# Tests

* **Unit** (`Templates.test.ts`): no template uses toolkit components; the source infos editor still renders descriptions only as escaped attribute values.
* **Integration** (`IReleaserDeployment.test.ts`): the workflows of the deployment config, one per line in the text area.
* Rendered in Chrome with the real templates and scripts (dark theme): source build settings, deployment config, source filter config, source dependencies, source infos editor, source filter table.
