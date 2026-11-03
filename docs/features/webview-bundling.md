# One webview build with shared chunks

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | finished (Unreleased) | [performance.md P10](../improvements/performance.md#p10--webview-bundles-duplicate-the-ui-toolkit-nunjucks-is-reconfigured-on-every-render), [maintainability.md M10](../improvements/maintainability.md#m10--webview-code-is-wired-via-13-near-identical-esbuild-configs) | – |

Related: [webview-csp.md](webview-csp.md) (chunks must be allowed by `script-src`), [dependency-hygiene.md](dependency-hygiene.md) (toolkit replacement).


# Current situation

* [esbuild.js](../../esbuild.js) has 13 copy-pasted configs, one per webview script. Each output is ~180 KB, mostly the same `@vscode/webview-ui-toolkit` code.
* `provideVSCodeDesignSystem().register(allComponents)` runs in every entry and again in [alertBox.ts](../../src/webview/tools/javascript/alertBox.ts), which most entries import. That registers twice per page.
* [main.ts](../../src/webview/main.ts) (→ `out/webview.js`, used by `SourceList`) only contains a "howdy" demo handler.
* Most providers call `nunjucks.configure(Constants.HTML_TEMPLATE_DIR)` on every render, which creates a new environment and template cache each time ([OBIController.ts:190](../../src/webview/controller/OBIController.ts#L190), [SourceList.ts:66](../../src/webview/source_list/SourceList.ts#L66), [SourceInfos.ts:95](../../src/webview/source_list/SourceInfos.ts#L95), [Welcome.ts:54](../../src/webview/controller/Welcome.ts#L54), …).


# New feature

## 1. One esbuild config for all webview scripts

```js
const fs = require('fs');
const path = require('path');

function webview_entries() {
  const entries = {};
  for (const file of fs.readdirSync('src/webview', { recursive: true })) {
    if (/[\\/]javascript[\\/][^\\/]+\.ts$/.test(file))
      entries[path.basename(file, '.ts')] = path.join('src/webview', file);
  }
  return entries;
}

const webviewConfig = {
  ...baseConfig,
  target: 'es2020',
  format: 'esm',
  splitting: true,
  entryPoints: webview_entries(),
  outdir: 'out/webview',
  chunkNames: 'chunks/[name]-[hash]',
};
```

* Output names stay the entry names (`out/webview/config.js`, …). Update the `getUri(..., ["out", "<name>.js"])` calls to `["out", "webview", "<name>.js"]`.
* Shared code (toolkit, `alertBox`) ends up in a chunk that is loaded once per page.
* Check that `out/webview/**` is within `localResourceRoots` (`out` is already listed).
* `fs.readdirSync(…, { recursive: true })` needs Node ≥ 20. Alternatively use `glob` (already a dev dependency).

## 2. Register the toolkit once

New module `src/webview/tools/javascript/toolkit.ts` that calls `provideVSCodeDesignSystem().register(allComponents)`. Every entry imports it as its first import, and `alertBox.ts` no longer registers.

## 3. Replace the demo script

Give `SourceList` its own entry `source_list.ts` (toolkit registration, plus the page logic if any) and delete `main.ts` / `out/webview.js`.

## 4. One Nunjucks environment

New module `src/webview/Templates.ts`:

```ts
const default_env = nunjucks.configure(Constants.HTML_TEMPLATE_DIR);       // created once
default_env.addFilter('typename', …);                                        // from OBIConfiguration

export function render(template: string, context: object): string { return default_env.render(template, context); }

/** Environment with the workspace's custom template folder (build summary only, see workspace-trust.md). */
export function render_with_custom_templates(template: string, context: object, custom_dir: string): string
```

Replace all `nunjucks.configure(...)` + `nunjucks.render(...)` and the module-level `env` copies in `OBIConfiguration`, `OBISourceConfiguration`, `OBISourceDependency` with these functions.


## Result

* `esbuild.js` finds the page scripts itself: every `src/webview/*/javascript/*.ts` except `tools/`. Output in `out/webview`, shared code in `out/webview/chunks`.
* Production build: 211 KB of webview JS in total (13 bundles of about 180 KB before); the toolkit chunk has 180 KB. VSIX: 119 files, 3.0 MB.
* `SourceList` has its own entry `source_list.ts`; `main.ts` (`out/webview.js`) is gone.
* [Templates.ts](../../src/webview/Templates.ts): `render_template(template, context, custom_dir?)`. The custom build summary template gets a new environment per call, so edits show up without a reload.
* Verified in a real VS Code, in the development and the production build (1.138) and in the development build (1.90): all pages and the OBI Build view load their chunks; toolkit, jQuery and bootstrap-table are there; no CSP report, script error or console error.
* Not opened: the deployment pages (hidden) and the quick settings view (hidden).


# Tests

* `npm run compile` produces `out/webview/<entry>.js` for all 12 entries plus chunks; total webview JS < 400 KB (was ~2.2 MB).
* Manual: open every webview, check the devtools console for errors and that toolkit components render.


### Definition of done
* One webview esbuild config with automatic entries and code splitting
* Toolkit registered once per page; demo script removed
* One Nunjucks environment (plus the custom-template variant)
* All webviews work; total webview JS size noted in the PR
* CHANGELOG entry
