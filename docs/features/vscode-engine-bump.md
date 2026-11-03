# Raise the minimum VS Code version

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | finished (1.90, decision 2026-10-23; tested with 1.90.0 and 1.138.0) | [maintainability.md M9](../improvements/maintainability.md#m9--outdated-vs-code-engine) | – |

Prerequisite for: [activation-events.md](activation-events.md), [log-level-and-rotation.md](log-level-and-rotation.md), [localisation.md](localisation.md), [webview-csp.md](webview-csp.md) (command URI allow-list).


# Current situation

`package.json`: `"engines": { "vscode": "^1.66.0" }` and `"@types/vscode": "^1.66.0"` (VS Code 1.66 is from March 2022). This blocks APIs that other specs need:

| API | Needed by | Available since |
|---|---|---|
| `vscode.l10n` + `l10n` bundles | [localisation.md](localisation.md) | 1.73 |
| implicit activation events for views/commands | [activation-events.md](activation-events.md) | 1.74 |
| `LogOutputChannel` (`createOutputChannel(name, { log: true })`) | [log-level-and-rotation.md](log-level-and-rotation.md) | 1.74 |
| `enableCommandUris` as a list of allowed commands | [webview-csp.md](webview-csp.md) | check `@types/vscode` of the chosen version |

The esbuild config sets no `target` for the extension bundle, so the output syntax isn't tied to the Node version of the targeted VS Code.


# New feature

1. **Choose the version.** Take the lowest version that provides all APIs above, but not older than about one year at release time. Recommendation: `^1.85.0` (December 2023) or newer. Check first whether users are stuck on older versions (enterprise installs). The release notes / README should state the requirement.
2. **Update** `engines.vscode` and `@types/vscode` to the same version. `vsce` refuses to package if `@types/vscode` is newer than `engines.vscode`.
3. **esbuild:** set `target` of the extension bundle to the Node version of that VS Code release (e.g. `node18` for 1.85) and `.nvmrc` for development/CI accordingly ([continuous-integration.md](continuous-integration.md)).
4. **Test** with the minimum version: `@vscode/test-electron` `runTests({ version: '1.85.0', … })` as an additional CI job, plus the current stable release.
5. **Document** the minimum version in [README.md](../../README.md) and the CHANGELOG ("Requires VS Code 1.85 or newer").


### Definition of done
* `engines.vscode` and `@types/vscode` raised consistently
* esbuild target and `.nvmrc` match the chosen version
* Tests run against the minimum and the current VS Code version
* README and CHANGELOG mention the requirement
