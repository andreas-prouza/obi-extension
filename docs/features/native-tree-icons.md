# Native icons in the source filter tree

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | finished (filter and member rows have icons as before; library and file rows stay without; no screenshot yet) | [usability.md U13](../improvements/usability.md#u13--use-native-vs-code-icons) | – |

Rule: [architecture.md → GUI](../architecture.md#gui) ("Icons sollen soweit wie möglich von VSCode native Icons sein"). Reduces the package size, see [vsix-package-size.md](vsix-package-size.md).


# Current situation

* `SourceListItem` ([SourceListProvider.ts:633-660](../../src/webview/source_list/SourceListProvider.ts#L633-L660)) uses `asserts/img/{light,dark}/edit.svg` for members and `error.svg` for members whose file is missing. The paths are built from `__filename`.
* These SVGs are copies of codicons. They don't follow the product icon theme or theme colours.
* `asserts/img/dark`, `light` and `light_old` contain 1,014 SVGs (6.8 MB). Only these two are referenced anywhere. `asserts/img/ext/logo.png` is the extension icon and stays.
* The build history tree already uses `ThemeIcon` ([BuildHistoryProvider.ts](../../src/webview/build_history/BuildHistoryProvider.ts)).


# New feature

* Tree items:

  | Item | Icon |
  |---|---|
  | source filter | `new vscode.ThemeIcon('filter')` |
  | library | `new vscode.ThemeIcon('library')` |
  | source file (folder) | `new vscode.ThemeIcon('folder')` |
  | member | `new vscode.ThemeIcon('file-code')` (today: `edit`) |
  | member, file missing | `new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'))` + tooltip "File not found" |

  Today only members get an icon. Library, file and filter rows without icons are allowed too; decide visually.
* Delete `asserts/img/dark`, `asserts/img/light`, `asserts/img/light_old`.
* Keep `asserts/img/ext/`.


### Definition of done
* Tree items use `ThemeIcon` only
* `asserts/img/{dark,light,light_old}` deleted; no reference to them left (grep)
* Screenshot in the PR (light + dark theme)
* CHANGELOG entry
