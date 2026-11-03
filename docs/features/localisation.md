# Complete localisation

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | finished (texts built in vscode-free modules — error classes, profile name validation, status bar text — and the output panels stay English; checked in English only, German needs a manual check with the language pack) | [usability.md U11](../improvements/usability.md#u11--localisation-is-incomplete) | [vscode-engine-bump.md](vscode-engine-bump.md) (`vscode.l10n`, ≥ 1.73) |

Also fixes [bugs.md #27](../bugs.md#27--localetext-writes-into-the-installed-extension).


# Current situation

* `package.nls.json` has 218 keys, `package.nls.en.json` 149 and `package.nls.de.json` 152. 68 keys have no German text, e.g. `obi.source-filter.add-source-file`, `obi.source.maintain-source-dependency`, `Source configuration`.
* Hard-coded English in `package.json`: 11 command titles (`obi.clearDiagnostics`, `obi.showErrors`, all `obi.build-history.*`, `obi.open.file`, `obi.source-quick-search`, `obi.show.tools`) and 2 view names ("OBI Build", "Build history").
* The templates use `LocaleText.get_Text(key)`, which reads `package.nls.<locale>.json` and falls back to `package.nls.json`. When a key is missing, it **writes** the key into `package.nls.json` inside the installed extension ([LocaleText.ts:53-58](../../src/extension/utilities/LocaleText.ts#L53-L58), bugs.md #27).
* Messages in TypeScript (`showErrorMessage`, `showInputBox`, …) are English only.
* `package.nls.en.json` is redundant: VS Code uses `package.nls.json` as the English default.


# New feature

## 1. Contributions (`package.json`)

* Use `%key%` for all command titles, view names and settings descriptions. Add the keys to `package.nls.json` and `package.nls.de.json`.
* Delete `package.nls.en.json` after merging any texts that exist only there into `package.nls.json`.

## 2. Runtime strings: `vscode.l10n`

* Add `"l10n": "./l10n"` to `package.json`. Create `l10n/bundle.l10n.json` (English, generated) and `l10n/bundle.l10n.de.json` (German).
* TypeScript messages use `vscode.l10n.t('Transfer {0} changed sources to {1}?', count, host)`.
* Generate `bundle.l10n.json` with Microsoft's `@vscode/l10n-dev` (`npx @vscode/l10n-dev export -o ./l10n ./src`). Check the package against the [criteria](../architecture.md#npm) first.

## 3. Templates

* `get_global_stuff().get_text` uses `vscode.l10n.t(key)` instead of `LocaleText`. Template keys move from `package.nls*.json` into the l10n bundles (they are runtime strings, not contributions).
* Remove `LocaleText` and the write-back (bugs.md #27). Missing keys are logged once at `debug` level and the key itself is shown.
* Keep `| safe` only for texts that intentionally contain HTML. Plain texts don't need it.

## 4. Check in CI

Script `scripts/check-l10n.js` (runs in [continuous-integration.md](continuous-integration.md)):
* every `%key%` in `package.json` exists in `package.nls.json` and `package.nls.de.json`;
* every key in `l10n/bundle.l10n.json` exists in `bundle.l10n.de.json`;
* every `get_text('…')` key used in `asserts/templates` exists in the bundle.


# Tests

* `node scripts/check-l10n.js` passes.
* Manual: VS Code with `"locale": "de"` → command palette, views, settings, notifications and webviews are German.


### Definition of done
* No hard-coded English in `package.json` contributions
* German texts complete for contributions, runtime messages and templates
* `LocaleText` and its write-back removed (bugs.md #27)
* CI check for missing keys
* CHANGELOG entry
