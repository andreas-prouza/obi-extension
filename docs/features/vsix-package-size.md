# Smaller extension package

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (about 120 files / 3 MB; bundled ssh2 checked against a local OpenSSH server, not yet against an IBM i or on Windows/macOS) | [maintainability.md M4](../improvements/maintainability.md#m4--the-vsix-would-contain-about-5500-files--20-mb) | [native-tree-icons.md](native-tree-icons.md), [dependency-hygiene.md](dependency-hygiene.md) |


# Current situation

`vsce ls` on the working tree (2026-10-22) lists **5,527 files (~20 MB uncompressed, maps already excluded)**:

| Part | Files | Why it's there |
|---|---|---|
| `out/asserts/**` | 2,236 | copied by `npm run compile` (`copy-assets`) |
| `asserts/img/**` | 1,041 | codicon copies, 2 used ([native-tree-icons.md](native-tree-icons.md)) |
| `node_modules/**` | ~1,600 | production dependencies, although esbuild bundles almost everything; incl. `@vscode/webview-ui-toolkit` with `@microsoft/fast-*` and `react` |
| `asserts/bootstrap/**` | 34 | full Bootstrap dist (RTL, ESM, unminified, grid/reboot/utilities) |
| `out/obi-media/**` | 22 | copied by `copy-obi-media`; the code uses the root `obi-media/` |
| `test-workspace-active/**`, `docs/**`, `example.js` | 38 | not excluded in [.vscodeignore](../../.vscodeignore) |

Why `out/asserts` exists: `Constants.HTML_TEMPLATE_DIR = path.join(__dirname, '..', 'asserts', 'templates')` ([Constants.ts:5](../../src/shared/Constants.ts#L5)). In the esbuild bundle `__dirname` is `out/`, so it resolves to the root `asserts/`. In the unbundled `tsc` output (`out/shared/Constants.js`), it resolves to `out/asserts/`. The copy keeps the tsc output working.

[esbuild.js:22](../../esbuild.js#L22) marks `ssh2` as external, so `node_modules/ssh2` and its dependencies must be shipped.


# New feature

## 1. Resolve resources from the extension path

* Replace `Constants.HTML_TEMPLATE_DIR` with a value set at activation: `Templates.init(context)` → `path.join(context.extensionPath, 'asserts', 'templates')` (see the shared Nunjucks environment in [webview-bundling.md](webview-bundling.md)).
* Same for any other `__dirname`/`__filename`-based path, e.g. the tree icons in `SourceListItem` (removed by [native-tree-icons.md](native-tree-icons.md)).
* Remove the `copy-assets`, `copy-obi-media` and `copy-all` scripts, and stop `compile` from calling them.
* Tests that import modules directly (unbundled, [test-setup.md](../bugfix/test-setup.md)) call `Templates.init(...)` with the repository root.

## 2. `.vscodeignore`

Add:

```
out/asserts/**
out/obi-media/**
out-test/**
test-resources/**
test-workspace-active/**
docs/**
example.*
esbuild.js
eslint.config.mjs
CLAUDE.md
ToDo.md
scripts/**
.github/**
```

Exclude the unused Bootstrap variants until [dependency-hygiene.md](dependency-hygiene.md) copies only the used vendor files.

## 3. Bundle `ssh2` and ship without `node_modules`

* esbuild `external: ['vscode', 'cpu-features', '*.node']`. ssh2 loads its optional native crypto binding and `cpu-features` inside `try/catch` and falls back to its JavaScript implementation.
* Package with `vsce package --no-dependencies` (script `"package:vsix"`). Then no `node_modules` are shipped at all.
* Verify: connect, transfer and run a build against an IBM i (or at least a local OpenSSH server in a CI integration test), on Linux, Windows and macOS.
* If ssh2 can't be bundled reliably, keep it external and use a `.vscodeignore` allow-list for `node_modules` (`!node_modules/ssh2/**`, `!node_modules/asn1/**`, `!node_modules/bcrypt-pbkdf/**`, `!node_modules/tweetnacl/**`, `!node_modules/safer-buffer/**`, …) instead of shipping all production dependencies.

## 4. Target and check

* Target: fewer than 500 files and less than 5 MB uncompressed. Record the actual numbers in the PR.
* The CI size check ([continuous-integration.md](continuous-integration.md)) uses the new number as its threshold.


### Definition of done
* No resource path depends on `__dirname`; copy scripts removed
* `.vscodeignore` excludes everything that isn't needed at runtime
* `ssh2` bundled and packaged with `--no-dependencies` (or the allow-list fallback, with the reason documented)
* Package size before/after recorded; CI threshold set
* Extension works from the packaged `.vsix` (install it in a clean VS Code profile and run a build)
* CHANGELOG entry
