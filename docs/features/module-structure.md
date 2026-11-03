# Module structure: dependency direction and conventions

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | ready (step 1 finished; steps 2–4 open) | [maintainability.md M7](../improvements/maintainability.md#m7--module-structure-global-static-state-and-circular-imports) | [bugfix/test-setup.md](../bugfix/test-setup.md) |

Pairs with [split-god-object-files.md](split-god-object-files.md). Pure refactoring, no behaviour change.


# Current situation

* **Circular imports and wrong direction**, for example:
  * `shared/AppConfig.ts` ↔ `extension/utilities/OBITools.ts` (AppConfig uses `OBITools.override_dict` and `get_local_obi_python_path`; OBITools uses AppConfig);
  * `extension/utilities/Workspace.ts` imports the webview `OBIConfiguration` ([Workspace.ts:6](../../src/extension/utilities/Workspace.ts#L6)) to refresh it on profile change;
  * `shared/ConstantsCallback.ts` imports tree providers from `webview/`;
  * `DirTool` imports `AppConfig` (for URIs) and `Workspace`.
* **Global static state** in almost every class (`SSH_Tasks.context`, `OBITools.ext_context`, `BuildSummary._extensionUri`, `…currentPanel`). Tests can't create isolated instances.
* **Naming** mixes `snake_case` (`get_app_config`, most of `extension/` and `webview/`) and `camelCase` (`getBuildOrder`, the ported `compile_list/modules`).
* The folder `asserts/` is presumably meant to be `assets/`.


# New feature

## 1. Dependency direction

```
shared/      ← pure types, constants, helpers; no vscode UI, no imports from extension/ or webview/
extension/   ← logic (config, SSH, build, files); may import shared/
webview/     ← panels, views, providers; may import extension/ and shared/
extension.ts ← wiring only
```

* Move `OBITools.override_dict` to `shared/dict_tools.ts`. Move the local OBI path check out of `AppConfig.self_check` into the caller (`OBITools.self_check`).
* `Workspace.change_profile` fires an event instead of calling `OBIConfiguration.update()`:
  ```ts
  private static readonly _on_did_change_profile = new vscode.EventEmitter<string>();
  public static readonly on_did_change_profile = Workspace._on_did_change_profile.event;
  ```
  `OBIConfiguration`, `OBIController` and the status bar subscribe.
* `ConstantsCallback` moves from `shared/` to `extension/` (or becomes registration code in `extension.ts`).
* Enforce it with an import-cycle check in CI: `madge --circular --extensions ts src` (check the [package criteria](../architecture.md#npm)) or `eslint-plugin-import` `import/no-cycle`. Start with the current cycles as the allowed baseline if needed, and reduce them.

## 2. Context instead of static globals (gradually)

* `extension.ts` creates the services once (`const services = create_services(context)`) and passes them to providers via constructor parameters.
* New code doesn't add static mutable state. Existing statics are migrated when a file is touched anyway, so there's no big-bang rewrite.

## 3. Conventions (decision)

Decide and document in [CLAUDE.md](../../CLAUDE.md):
* naming for functions and methods (recommendation: `snake_case`, the majority of the code base; the ported `compile_list/modules` are renamed when they are refactored anyway);
* one class per file for providers and panels; plain functions for helpers;
* together with the command ID prefix decision from [command-id-naming-convention.md](command-id-naming-convention.md).

## 4. `asserts` → `assets` (optional)

Only if it's done together with another change that touches all asset paths ([dependency-hygiene.md](dependency-hygiene.md), [vsix-package-size.md](vsix-package-size.md)). It's pure churn otherwise.


## Status

* Step 1 finished: nothing in `shared/` imports from `extension/` or `webview/`, and no utility imports a webview. `AppConfig`, `EspConfig` → `extension/config`; `Dependency` → `extension/obi`; `ShellQuote` → `shared`; `override_dict` → `shared/DictTools.ts`; `AppConfig.self_check` → `OBITools.check_local_obi`; `ConstantsCallback` → `file_callbacks.ts` (wiring, passed to `HealthyWatchdog`); `Workspace.change_profile` only fires `on_did_change_profile`.
* `extension/obi/OBICommands.ts` still imports webviews (`BuildSummary`, `OBIController`, `BuildHistoryProvider`). That goes with [split-god-object-files.md](split-god-object-files.md).
* Import cycles: `check-repo` counts them without an extra package (Tarjan on the imports, `import type` ignored). Baseline: 16 modules, in `MODULES_IN_CYCLES`.
* Open: step 2 (context instead of static state, gradually), step 3 (**decision needed:** naming convention in `CLAUDE.md`), step 4 (optional).


### Definition of done
* No imports from `extension/` or `webview/` inside `shared/`; no utility imports a webview
* Import-cycle check in CI (with a baseline that only goes down)
* Profile changes propagate via an event
* Naming convention documented in CLAUDE.md
* No behaviour change: all tests pass, manual smoke test of build, show changes and config page
