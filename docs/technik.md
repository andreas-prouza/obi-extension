# Technik

## Package-Prüfung

Kriterien: siehe [architecture.md](architecture.md#npm) (GitHub-Repository, mehrere Forks, mindestens 200 Sterne).
Werte zum Zeitpunkt der Prüfung (GitHub API).

| Package | Repository | Sterne | Forks | Geprüft | Ergebnis | Verwendung |
|---|---|---|---|---|---|---|
| `jquery` 3.7.1 | jquery/jquery | 59.909 | 20.527 | 2026-10-23 | ✅ | bootstrap-table (Webviews) |
| `bootstrap` 5.3.3 | twbs/bootstrap | 175.007 | 78.521 | 2026-10-23 | ✅ | Tabellen-Layout der Webviews |
| `bootstrap-table` 1.23.2 | wenzhixin/bootstrap-table | 11.808 | 4.337 | 2026-10-23 | ✅ | Tabellen der Webviews |
| `tom-select` 2.4.3 | orchidjs/tom-select | 2.238 | 175 | 2026-10-23 | ✅ | Source-Auswahl mit Suche |
| `@vscode/codicons` | microsoft/vscode-codicons | 1.173 | 214 | 2026-10-23 | ✅ | Icons der Webviews |
| `@vscode/webview-ui-toolkit` 1.4.0 | microsoft/vscode-webview-ui-toolkit | 2.108 | 159 | 2026-10-23 | ⚠️ archiviert (seit 2024) | alle Webviews (`vscode-button`, `vscode-text-field`, …) |
| `@vscode-elements/elements` 2.5.1 | vscode-elements/elements | 458 | 47 | 2026-10-23 | ✅ (Kandidat) | Ersatz für das Webview UI Toolkit, noch nicht umgestellt |
| `node-ssh` 13 | steelbrain/node-ssh | 1.007 | 94 | 2026-10-24 | ✅ | SSH und SFTP zur IBM i |
| `ssh2` (über node-ssh) | mscdex/ssh2 | 5.825 | 737 | 2026-10-24 | ✅ | wird in die Extension gebündelt |
| `nunjucks` 3 | mozilla/nunjucks | 9.003 | 663 | 2026-10-24 | ✅ | HTML-Templates |
| `smol-toml` 1 | squirrelchat/smol-toml | 317 | 22 | 2026-10-24 | ✅ | TOML lesen und schreiben |
| `minimatch` 10 | isaacs/minimatch | 3.526 | 390 | 2026-10-24 | ✅ | Glob-Muster (Filter, Watcher, Transfer) |
| `deepmerge` 4 | TehShrike/deepmerge | 2.818 | 225 | 2026-10-24 | ✅ | Konfigurationsseite |
| `winston` 3 | winstonjs/winston | 24.527 | 1.853 | 2026-10-24 | ✅ | Logger |
| `winston-transport` 4 | winstonjs/winston-transport | 71 | 39 | 2026-10-24 | ⚠️ unter 200 Sternen | Teil von winston (dessen eigene Abhängigkeit), für den Transport in den Output Channel. Ausnahme noch zu genehmigen |
| `@ibm/ibmi-eventf-parser` 2 | IBM/ibmi-eventf-parser | 8 | 1 | 2026-10-24 | ⚠️ unter 200 Sternen | offizieller Parser von IBM für EVFEVENT-Dateien. Ausnahme noch zu genehmigen |
| `ajv` 8 (nur Tests) | ajv-validator/ajv | 14.866 | 1.063 | 2026-11-01 | ✅ | prüft die JSON-Schemas in den Tests |
| `c8` 12 (nur Tests) | bcoe/c8 | 2.124 | 100 | 2026-11-01 | ✅ | Testabdeckung |
| `wildcard-match` | axtgr/wildcard-match | 54 | 0 | 2026-10-24 | ❌ entfernt | durch `minimatch` ersetzt |
| `@decimalturn/toml-patch` | DecimalTurn/toml-patch | 9 | 1 | 2026-10-24 | ❌ nicht verwendet | siehe [toml-format-preserving-save.md](features/toml-format-preserving-save.md) |

Die Front-End-Bibliotheken werden per npm installiert und von `scripts/copy-vendor.js` nach `out/vendor` kopiert (nur die verwendeten Dateien), damit `npm audit` und Dependabot sie sehen.

### Ersatz für das Webview UI Toolkit

`@vscode/webview-ui-toolkit` ist archiviert und bekommt keine Updates mehr. `@vscode-elements/elements` erfüllt die Kriterien und bietet die verwendeten Komponenten (Button, Textfeld, Checkbox, Dropdown/Option, Tabs/Panels, Divider, Textarea; `vscode-data-grid` wird nur in `main.ts` registriert). Die Umstellung betrifft alle Templates und Webview-Skripte und wird Panel für Panel gemacht (eigene Aufgabe, mit Prüfung jeder Seite in der Oberfläche).
