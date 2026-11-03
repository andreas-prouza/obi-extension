# Activate only in OBI projects

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (reload after *Initialize* kept; node-ssh not loaded lazily; activation time not measured) | [performance.md P4](../improvements/performance.md#p4--the-extension-activates-in-every-vs-code-window) | [vscode-engine-bump.md](vscode-engine-bump.md) (≥ 1.74), [reload-free-config-changes.md](reload-free-config-changes.md) |


# Current situation

* `"activationEvents": ["onStartupFinished"]` ([package.json:31-33](../../package.json#L31-L33)) activates the extension in **every** VS Code window, also without an OBI project.
* Activation loads the ~525 KB bundle, winston, nunjucks, smol-toml and node-ssh. It also creates the "OBI" output channel at import time ([Logger.ts:9](../../src/extension/utilities/Logger.ts#L9)), which then appears in the Output dropdown of every window.
* The Welcome view uses `"when": "obi.contains_obi_project == false"`. The context key is set by the extension itself, so the view only works if the extension is already active.


# New feature

## Activation events

```json
"activationEvents": [
  "workspaceContains:.obi/etc/app-config.toml"
]
```

Since VS Code 1.74, contributed views and commands activate the extension implicitly (`onView:…`, `onCommand:…`), so they don't have to be listed.

## Welcome view without an active extension

* Change the Welcome view condition to `"when": "!obi.contains_obi_project"`. An unset key counts as false, so the view is visible in non-OBI workspaces before activation. Opening it triggers the implicit `onView:obi-welcome` activation.
* The OBI activity bar icon stays visible in all windows (as today). Only the Welcome view resolves until a project exists.
* After *Initialize*, the project views must appear without reloading the window ([reload-free-config-changes.md](reload-free-config-changes.md)). Until that is implemented, keep the reload after *Initialize*.

## Lazy logger

* Create the output channel in a `Logger.init(context)` called from `activate()` (also needed for [log-level-and-rotation.md](log-level-and-rotation.md)).
* Until `init` runs, log calls are buffered (or dropped at debug level).

## Lazy heavy modules (optional)

Loading `node-ssh` only when the first SSH action runs (`await import('node-ssh')`) reduces activation time further. Measure with *Developer: Show Running Extensions* before and after; only do it if the gain is noticeable.


# Tests

* Manual: open a folder without `.obi` → OBI is not in *Show Running Extensions*, and no "OBI" output channel exists. Click the OBI activity bar icon → the Welcome view appears and the extension activates.
* Manual: open an OBI project → the extension activates at startup (as today).
* Integration test: in a non-OBI test workspace, `vscode.extensions.getExtension('andreas-prouza.obi').isActive === false` after startup.


### Definition of done
* Activation only for workspaces containing `.obi/etc/app-config.toml`, or when an OBI view/command is used
* Welcome view works without prior activation
* No output channel in non-OBI windows
* Activation time before/after noted in the PR; CHANGELOG entry
