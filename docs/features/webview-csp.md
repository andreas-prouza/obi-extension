# Content-Security-Policy for all webviews

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (all pages opened in VS Code 1.90 and 1.138 with no CSP report or script error; command URI allow-lists wait for the engine bump) | [security.md S6](../improvements/security.md#s6--no-content-security-policy-in-any-webview) | [bugfix/source-description-xss.md](../bugfix/source-description-xss.md), [bugfix/secret-storage-ui-state.md](../bugfix/secret-storage-ui-state.md) |

Related: [webview-bundling.md](webview-bundling.md), [dependency-hygiene.md](dependency-hygiene.md).


# Current situation

* None of the templates in [asserts/templates/](../../asserts/templates/) sets a `Content-Security-Policy`. The nonce generated in `get_global_stuff` ([OBITools.ts:476](../../src/extension/utilities/OBITools.ts#L476)) is put on the module scripts, but without a CSP it has no effect.
* `getNonce()` ([getNonce.ts](../../src/extension/utilities/getNonce.ts)) uses `Math.random()`.
* Inline scripts and handlers that a strict CSP would block:

  | Template | Inline code |
  |---|---|
  | [configuration.html:120-123](../../asserts/templates/controller/configuration.html#L120-L123) | `panel = "{{ panel }}"; panel_tab = "{{ panel_tab }}";` |
  | [config_source_list.html:38-46](../../asserts/templates/controller/config_source_list.html#L38-L46) | `new TomSelect("#config_source_list", …)` |
  | [maintain-source-dependency.html:146-212](../../asserts/templates/source_list/maintain-source-dependency.html#L146-L212) | two `new TomSelect(…)` and a commented-out Choices block |
  | [source-infos-config.html:66](../../asserts/templates/source_list/source-infos-config.html#L66), [91-119](../../asserts/templates/source_list/source-infos-config.html#L91-L119) | `onfocusout=…`, `update_cell()` — removed by [source-description-xss.md](../bugfix/source-description-xss.md) |
  | [show_changes/index.html:26](../../asserts/templates/show_changes/index.html#L26) | `onclick="run_build()"`. `run_build` is module-scoped and not reachable from there anyway (the bundle also adds a listener), so this handler only throws. |

* All webviews set `enableCommandUris: true`, but only 8 templates use `command:` links, and only for `vscode.open` (16×) and `obi.open_build_summary` (1×).


# New feature

## Strict script policy for every page

### Policy

```
default-src 'none';
script-src 'nonce-{{nonce}}' {{csp_source}};
style-src {{csp_source}} 'unsafe-inline';
font-src {{csp_source}};
img-src {{csp_source}} data:;
```

* `csp_source` = `webview.cspSource`. Allowing it in `script-src` lets the vendored libraries load from `asserts/` and lets ES module chunks load from `out/` ([webview-bundling.md](webview-bundling.md)). No inline script can run.
* `style-src 'unsafe-inline'` stays, because the templates and bootstrap-table use `style` attributes heavily. Removing it is a separate clean-up.

### Implementation

1. **Nonce:** `getNonce()` → `crypto.randomBytes(16).toString('base64')`.
2. **Global stuff:** `OBITools.get_global_stuff(webview, …)` additionally returns `csp_source: webview.cspSource`.
3. **Partial** `asserts/templates/tools/csp.html`:
   ```html
   <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-{{ global_stuff['nonce'] }}' {{ global_stuff['csp_source'] }}; style-src {{ global_stuff['csp_source'] }} 'unsafe-inline'; font-src {{ global_stuff['csp_source'] }}; img-src {{ global_stuff['csp_source'] }} data:;">
   ```
   `{% include "tools/csp.html" %}` as the first element in `<head>` of every **page** template (not in partials such as `config_details.html`).
4. **Remove inline code:**
   * `configuration.html`: render `<body data-panel="…" data-panel-tab="…">` and read it in [config.ts](../../src/webview/controller/javascript/config.ts) `main()`. Validate the values as described in [secret-storage-ui-state.md](../bugfix/secret-storage-ui-state.md).
   * TomSelect initialisation: move into [config.ts](../../src/webview/controller/javascript/config.ts) and [source_dependency.ts](../../src/webview/source_list/javascript/source_dependency.ts). Until TomSelect is bundled from npm ([dependency-hygiene.md](dependency-hygiene.md)), access the global with a typed declaration in [globals.d.ts](../../src/webview/globals.d.ts):
     ```ts
     declare class TomSelect { constructor(selector: string | HTMLElement, options: Record<string, unknown>); }
     ```
     and make sure the vendored script is loaded **before** the module script.
   * Remove the commented-out Choices block and the `onclick="run_build()"`.
5. **Command URIs:** limit to the commands in use where the VS Code API allows it (`enableCommandUris: ['vscode.open', 'obi.open_build_summary']`, an array is accepted by newer VS Code versions, see [vscode-engine-bump.md](vscode-engine-bump.md)). Set `enableCommandUris: false` for webviews without `command:` links (Welcome, ConfigInvalid, QuickSettings, I_Releaser, DeploymentConfig, OBIController if no link remains).
6. **Custom build list template** (`.obi/.vscode/templates/custom_build_list_template.html`): inline scripts in it stop working. Document this in [building.md](../../asserts/docs/building.md), see also [workspace-trust.md](workspace-trust.md).

### Guard against regressions
Add a CI check ([continuous-integration.md](continuous-integration.md)): every page template includes `tools/csp.html`; no template contains `<script>` without `src`, and no `on[a-z]+=` attributes.


# Tests

* Open every webview (build summary, config, source config, source infos view/edit, source filter config and view, dependency maintenance, controller, welcome, config invalid) with the webview devtools open: no CSP violation messages, all buttons work.
* Unit test: `getNonce()` returns 24 base64 characters and two calls differ.


### Definition of done
* Every webview page has the CSP above; the nonce comes from `crypto`
* No inline scripts or inline event handlers remain in `asserts/templates`
* Command URIs are disabled or limited where possible
* CI check for CSP include and inline scripts
* Docs updated for the custom template; CHANGELOG entry
