# No window reloads on config changes

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (Unreleased) | [usability.md U4](../improvements/usability.md#u4--config-changes-reload-the-whole-window) | [bugfix/disposables-and-deactivate.md](../bugfix/disposables-and-deactivate.md) |

Enables: [activation-events.md](activation-events.md) (*Initialize* without reload).


# Current situation

`activate()` ([extension.ts:30-384](../../src/extension.ts#L30-L384)) branches early:
1. no OBI project → only the Welcome view is registered, `return`;
2. `self_check()` fails → `reload_obi_extension_on_config_change()` creates watchers that **reload the window** on the next change of the config files ([OBITools.ts:1081-1099](../../src/extension/utilities/OBITools.ts#L1081-L1099)), `return`;
3. otherwise everything is registered.

So every transition between these states needs a reload. There are 6 `workbench.action.reloadWindow` calls:

| Where | Trigger |
|---|---|
| [OBITools.ts:460](../../src/extension/utilities/OBITools.ts#L460) | after *Initialize* |
| [OBITools.ts:1092](../../src/extension/utilities/OBITools.ts#L1092), [OBITools.ts:1096](../../src/extension/utilities/OBITools.ts#L1096) | project/user config changed while `self_check` failed |
| [OBIConfiguration.ts:475-476](../../src/webview/controller/OBIConfiguration.ts#L475-L476) | config became complete after saving |
| [Welcome.ts](../../src/webview/controller/Welcome.ts), [ConfigInvalid.ts](../../src/webview/controller/ConfigInvalid.ts) | explicit "Reload" buttons (user-initiated, keep) |

A reload restarts terminals, ends debug sessions and loses unsaved webview input.


# New feature

## 1. Register everything once

* `activate()` registers all providers, views and commands unconditionally. The `when` clauses in `package.json` already control what is visible.
* Commands that need a valid project check it at invocation and show "No valid OBI project / configuration" (with *Open configuration*) instead of failing.

## 2. One state function

```ts
// src/extension/ProjectState.ts
export async function update_project_state(context: vscode.ExtensionContext): Promise<void> {
  const contains = OBITools.contains_obi_project();
  await vscode.commands.executeCommand('setContext', 'obi.contains_obi_project', contains);
  if (!contains) { await set_valid(false); return; }

  const error = try_self_check();                       // returns message instead of throwing
  const valid = !error && !AppConfig.get_app_config().attributes_missing();
  await set_valid(valid);
  if (valid) await init_project_services(context);       // idempotent
}
```

* `init_project_services` starts what today only starts for a valid project: file watchers (`HealthyWatchdog`), `LocalSourceList.load_source_list()`, log file transports, startup remote check. Calling it a second time does nothing.
* Call `update_project_state` at activation, after *Initialize*, after saving the config, and from a watcher on `.obi/etc/app-config.toml` and the user config files (debounced, see [file-watcher-debounce.md](file-watcher-debounce.md)).

## 3. Remove the reloads

* Delete `reload_obi_extension_on_config_change` and the reload in `OBIConfiguration.save_config`.
* After *Initialize*: `update_project_state()` + refresh views.
* Keep the explicit reload buttons in the Welcome and Invalid config views.

## 4. Views

* After the state changes, refresh the tree providers and the OBI Build view (they become visible through their `when` clauses).
* [bugs.md #13](../bugs.md#13--missing-mandatory-config-only-warns) (missing config only warns) is decided here: an incomplete config sets `obi.valid-config = false`, so the *Invalid config* view is shown, and it switches back automatically once the config is complete.


## Result

* [ProjectState.ts](../../src/extension/ProjectState.ts): `update()` sets `obi.contains_obi_project`, `obi.valid-config` and `obi.run_native`, calls `register_project_features` once when a project is found and `start_project_services` once when the configuration is valid. Calls during a running update are run once afterwards. A watcher on `.obi/etc/{app-config.toml,.user-app-config*.toml,workspace-settings.json}` (300 ms debounce) and `save_config` / *Initialize* call it.
* Deviation from step 1: commands and views are registered when the first project is found (at activation or after *Initialize*), not in a window without project, because many of them need the workspace folder. Their `when` clauses hide them until the configuration is valid.
* bugs.md #13: decided to keep the views enabled for an incomplete configuration (see there).
* Manual checks open: *Initialize* in an empty folder (views appear, configuration opens), breaking and fixing `app-config.toml` while VS Code is open.


# Tests

* Integration test: start with an empty folder → *Initialize* → project views appear without reload (`obi.contains_obi_project` true, providers return data).
* Integration test: break `app-config.toml` → `obi.valid-config` false; fix it → true again, no reload.


### Definition of done
* No automatic `reloadWindow` left (only the explicit buttons)
* Project state and services update in place on initialize, config save and config file changes
* bugs.md #13 decided and removed
* CHANGELOG entry
