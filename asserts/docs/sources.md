[← Back to README](../../README.md)

# Sources

- [Folder layout](#folder-layout)
- [Source filters](#source-filters)
- [Table view](#table-view)
- [Quick search](#quick-search)
- [Source descriptions](#source-descriptions)
- [Create, rename and delete sources](#create-rename-and-delete-sources)
- [Source actions](#source-actions)


## Folder layout

All sources are stream files below the source directory (setting *source-dir*, default `src`):

```
src/<library>/<source file>/<member>.<attribute>.<type>
```

e.g. `src/mylib/qrpglesrc/order.sqlrpgle.pgm`.

Everywhere in OBI (dependencies, source settings, descriptions, build lists) a source is identified by its path **relative to the source directory**, e.g. `mylib/qrpglesrc/order.sqlrpgle.pgm`.

The type (last extension) must be one of the *supported object types* (default `pgm`, `file`, `srvpgm`, `module`, `cpy`, `obj`).
The project initialization adds file associations (`.vscode/settings.json`) so VS Code recognizes these files, e.g. `*.rpgle.pgm` as RPGLE.


## Source filters

The **Source filters** view shows your sources as a tree: *filter → library → source file → member*, including descriptions.
Each filter is a JSON file in `.obi/source-list/` and can be shared with your team via git.

![Source filters](../img/ext/source-filter-1.png)

* ➕ in the view title creates a new filter. It opens the filter configuration.
* On a filter: show as [table](#table-view), ⚙ edit the filter configuration, 🗑 delete the filter (without confirmation).
* ↻ refreshes the view. New and deleted source files are picked up automatically.
* When you switch the editor, the active source is revealed in the tree.
* Members whose file does not exist are marked with an error icon.

### Filter configuration

A filter consists of one or more rows. A source is shown if it matches **any** row.

| Column | Meaning |
|---|---|
| Lib / File / Member | Pattern for library, source file and member (case-insensitive). Several patterns can be separated by comma; they are split into separate rows |
| Regex | Off: wildcard pattern (`*`, `?`). On: regular expression that must match the whole name (e.g. `.*`) |
| Empty folder | Also show libraries and source files without members |

Example `.obi/source-list/Orders.json`:

```json
[
  {
    "source-lib": "mylib",
    "source-file": "qrpglesrc",
    "source-member": "ord*",
    "use-regex": false,
    "show-empty-folders": false
  }
]
```


## Table view

Opens a filter as a table which can be sorted and filtered by library, file, member and description.
Click a member to open the source.

![Source filter as table](../img/ext/source-filter-2.png)


## Quick search

🔍 in the title of the Source filters view (command **OBI: Source quick search**) searches all sources by name **and description** and opens the selected one.

![Quick search](../img/ext/quick-search.png)


## Source descriptions

Descriptions are stored in `.obi/etc/source-infos.json` and shown in the tree, the table view and the quick search.

* **Change source description**: on a member in the tree, or in the submenu **OBI** of the context menu of the explorer or editor tab
* **Show source infos** (view title): read-only table of all descriptions
* **Maintain source infos** (view title): edit all descriptions in a table; a description is saved when you leave its field

![Maintain source descriptions](../img/ext/source-filter-3.png)


## Create, rename and delete sources

In the Source filters tree:

* On a **library**: **Add source file** creates a new source file folder.
* On a **source file**: **Add source member** creates an empty source and opens it. The name must end with a supported type, e.g. `new.rpgle.pgm`.
* On a **member** (context menu):
  * **Rename**: renames the file
  * **Delete**: asks first, then moves the file to the trash (if there is none, e.g. in some remote windows, OBI asks again before deleting it for good). The question names the build packages that contain the source and the sources that use it. The source is removed from `source-config.toml`, `dependency.json` (its own dependencies and the references of other sources), `object-builds.json`, the build packages and `source-infos.json`. Deleting a file in the VS Code Explorer doesn't do this.

**Renames keep the configuration in sync.** When you rename a source file in the Source filters tree or in the VS Code Explorer, OBI updates the source name in:

* the per-source build settings (`source-config.toml`)
* the dependency list (`dependency.json`)
* the compiled object list (`object-builds.json`)
* the descriptions (`source-infos.json`)

This works for renaming single source files. Renaming a library or source file folder does **not** update the configuration.


## Source actions

In the context menu of a member in the tree, of a file in the explorer and of an editor tab, all in the submenu **OBI** (the first three also as icons on a member in the tree; in the Command Palette with the prefix *OBI:*, for the active editor). In the explorer and on an editor tab, the submenu is only shown for files whose last extension is one of the `supported-object-types` (e.g. `order.rpgle.pgm`, see [Configuration](configuration.md)):

| Action | Description |
|---|---|
| **Individual build settings** | Settings and build steps for this source only. See [Per-source build settings](configuration.md#per-source-build-settings) |
| **Change source description** | See [Source descriptions](#source-descriptions) |
| **Maintain source dependencies** | Which sources this source depends on, and which depend on it. See [Dependencies](dependencies.md) |
| **Mark source as built (store current hash)** | The source counts as built. See [Hash of a single source](building.md#hash-of-a-single-source) |
| **Mark source as changed (remove hash)** | The source counts as new at the next build. See [Hash of a single source](building.md#hash-of-a-single-source) |
