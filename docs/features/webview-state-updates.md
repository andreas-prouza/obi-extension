# Keep webview panels and their UI state

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | finished (Unreleased, phase 1) | [performance.md P11](../improvements/performance.md#p11--webviews-are-fully-re-rendered-for-every-change), [usability.md U10](../improvements/usability.md#u10--webviews-lose-position-scroll-and-expanded-state) | – |

Related: [bugfix/controller-view-retain-context.md](../bugfix/controller-view-retain-context.md) (OBI Build view), [webview-message-protocol.md](webview-message-protocol.md).


# Current situation

* `BuildSummary.render()` disposes the existing panel and creates a new one in `ViewColumn.One` ([BuildSummary.ts:76-79](../../src/webview/show_changes/BuildSummary.ts#L76-L79), [BuildSummary.ts:500-525](../../src/webview/show_changes/BuildSummary.ts#L500-L525)). A panel the user moved to another editor group jumps back. `SourceInfos`, `OBISourceConfiguration` and `LogOutput` behave the same way.
* `update()` replaces `webview.html` ([BuildSummary.ts:413-422](../../src/webview/show_changes/BuildSummary.ts#L413-L422)). The page reloads: scroll position, opened `<details>` (commands, logs) and collapsed levels are lost. This happens after every build, every *Add source* and every *Edit command*.
* The config page re-renders after almost every action (`reload` message, [OBIConfiguration.ts:345-347](../../src/webview/controller/OBIConfiguration.ts#L345-L347)) and loses scroll position.


# New feature

## Phase 1: keep panels, restore UI state

1. **Reuse panels:** if `currentPanel` exists, set the new HTML on it and call `reveal(undefined, true)` (keep its column, don't steal focus during a build). Only create a panel when none exists.
2. **Persist UI state in the page** via `vscode.setState()`:
   * build summary: `scroll_y`, the ids of open `<details>`, collapsed levels;
   * config page: `scroll_y` (tab selection is restored already).

   Give the relevant elements stable ids (e.g. `details-<level>-<source>-<cmd_index>`). Restore on load with `vscode.getState()`.

   Verify that state survives a `webview.html` replacement. If it doesn't in a VS Code version, the extension sends the last state back with the new HTML (`data-ui-state` attribute).

## Phase 2: incremental updates during a build (optional)

* Status changes of single commands are sent as messages (`{ command: 'cmd_status', source, cmd_index, status }`) and patched into the DOM (`textContent`, CSS class) instead of re-rendering.
* Requires `data-source` / `data-cmd-index` attributes on the rows and typed messages ([webview-message-protocol.md](webview-message-protocol.md)).


## Result

* Build summary: the panel is reused (`webview.html` replaced, `reveal(undefined)`); `keep_ui_state` ([ui_state.ts](../../src/webview/tools/javascript/ui_state.ts)) keeps the scroll position and the `<details data-state-id>` the user toggled (sections they didn't touch keep their default, e.g. failed commands open) in `vscode.setState`; collapsed levels are kept too. The configuration page uses the same helper for the scroll position.
* Source infos, source config and log panels are still created anew (their content is per item), but in the editor group of the previous panel.
* Phase 2 (patching command states during a build): **not done**, follow-up. The summary is updated after the build, not while it runs, so phase 1 covers the visible problem.
* Automated: integration test for panel reuse and the editor group.
* Verified in a real VS Code (1.90 and 1.138, driven over the DevTools protocol): on the build summary, closed sections, a collapsed level and the scroll position survive replacing `webview.html`, so the `data-ui-state` fallback isn't needed.


# Tests

* Manual: move the build summary to the right editor group, run a build → it stays there and keeps the scroll position; opened command details stay open.
* Manual: config page, scroll down, add a global variable → position is kept.


### Definition of done
* Panels are reused and keep their editor group
* Scroll position and opened/collapsed sections survive updates (build summary, config page)
* Phase 2 decided (done or recorded as follow-up)
* CHANGELOG entry
