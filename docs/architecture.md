# Architecture and rules

Rules for the OBI extension. [CONTRIBUTING.md](../CONTRIBUTING.md) has the setup, the test commands and a short summary of these rules.

- Platform: VS Code extension
- Language: TypeScript
- Security has top priority.
  Security vulnerabilities must be prevented.
  Security comes before features, unless it's explicitly decided otherwise.
  * Values for the remote shell are quoted with `sh_quote` (`src/shared/ShellQuote.ts`).
  * Messages from webviews are validated with the message tables in `src/shared/messages`.
  * Secrets are never written to logs or files.


# Code structure

* `src/shared/` has pure code and imports nothing from `extension/` or `webview/`.
* `src/extension/` is the logic (config, SSH, build, files), `src/webview/` the pages and views.
* `src/extension.ts` and `src/file_callbacks.ts` only wire them together.
* TypeScript strict mode, no new `any`. Logic that doesn't need VS Code goes into a module without a `vscode` import, so it can be unit-tested.
* `npm run check:repo` counts the modules in import cycles. The baseline may only go down ([module-structure.md](features/module-structure.md)).


# NPM

Packages have to meet these criteria:
* No security risks
* Widely known
* A GitHub repository has to exist
* The GitHub repository has to have several forks and at least 200 stars

If no package meets the criteria, ask how to proceed.  
Also list which criteria were not met.

Front-end libraries of the webviews are installed with npm as well. `scripts/copy-vendor.js` copies only the files that are used to `out/vendor`, so `npm audit` and Dependabot cover them.

## Reviewed packages

Every package that was checked against the criteria, with the values at the time of the check (GitHub API). Exceptions need the owner's approval.

| Package | Repository | Stars | Forks | Checked | Result | Used for |
|---|---|---|---|---|---|---|
| `jquery` 3.7.1 | jquery/jquery | 59,909 | 20,527 | 2026-10-23 | ✅ | bootstrap-table (webviews) |
| `bootstrap` 5.3.3 | twbs/bootstrap | 175,007 | 78,521 | 2026-10-23 | ✅ | table layout of the webviews |
| `bootstrap-table` 1.23.2 | wenzhixin/bootstrap-table | 11,808 | 4,337 | 2026-10-23 | ✅ | tables of the webviews |
| `tom-select` 2.4.3 | orchidjs/tom-select | 2,238 | 175 | 2026-10-23 | ✅ | source selection with search |
| `@vscode/codicons` | microsoft/vscode-codicons | 1,173 | 214 | 2026-10-23 | ✅ | icons of the webviews |
| `@vscode/webview-ui-toolkit` 1.4.0 | microsoft/vscode-webview-ui-toolkit | 2,108 | 159 | 2026-10-23 | ⚠️ archived (since 2024) | all webviews (`vscode-button`, `vscode-text-field`, …). Replacement: [dependency-hygiene.md](features/dependency-hygiene.md#4-replace-the-deprecated-webview-toolkit) |
| `@vscode-elements/elements` 2.5.1 | vscode-elements/elements | 458 | 47 | 2026-10-23 | ✅ (candidate) | replacement for the webview UI toolkit, not migrated yet |
| `node-ssh` 13 | steelbrain/node-ssh | 1,007 | 94 | 2026-10-24 | ✅ | SSH and SFTP to the IBM i |
| `ssh2` (via node-ssh) | mscdex/ssh2 | 5,825 | 737 | 2026-10-24 | ✅ | bundled into the extension |
| `nunjucks` 3 | mozilla/nunjucks | 9,003 | 663 | 2026-10-24 | ✅ | HTML templates |
| `smol-toml` 1 | squirrelchat/smol-toml | 317 | 22 | 2026-10-24 | ✅ | reading and writing TOML |
| `minimatch` 10 | isaacs/minimatch | 3,526 | 390 | 2026-10-24 | ✅ | glob patterns (filters, watchers, transfer) |
| `deepmerge` 4 | TehShrike/deepmerge | 2,818 | 225 | 2026-10-24 | ✅ | configuration page |
| `winston` 3 | winstonjs/winston | 24,527 | 1,853 | 2026-10-24 | ✅ | logger |
| `winston-transport` 4 | winstonjs/winston-transport | 71 | 39 | 2026-10-24 | ⚠️ below 200 stars | part of winston (a dependency of winston itself), for the transport into the output channel. Exception still needs approval |
| `@ibm/ibmi-eventf-parser` 2 | IBM/ibmi-eventf-parser | 8 | 1 | 2026-10-24 | ⚠️ below 200 stars | IBM's official parser for EVFEVENT files. Exception still needs approval |
| `ajv` 8 (tests only) | ajv-validator/ajv | 14,866 | 1,063 | 2026-11-01 | ✅ | checks the JSON schemas in the tests |
| `c8` 12 (tests only) | bcoe/c8 | 2,124 | 100 | 2026-11-01 | ✅ | test coverage |
| `wildcard-match` | axtgr/wildcard-match | 54 | 0 | 2026-10-24 | ❌ removed | replaced by `minimatch` |
| `@decimalturn/toml-patch` | DecimalTurn/toml-patch | 9 | 1 | 2026-10-24 | ❌ not used | see [toml-format-preserving-save.md](features/toml-format-preserving-save.md) |


# GUI

* Use native VS Code icons wherever possible.
* Use icons for buttons where possible. Icon + text is fine too.
* Use HTML templates with a template engine: Nunjucks (Jinja2 syntax), in `asserts/templates`.
* Webviews have a strict Content-Security-Policy: no inline scripts and no inline event handlers (`on…=`).


# Commands, settings and texts

* Every command and setting is declared in `package.json`, with its texts in `package.nls.json` and `package.nls.de.json`.
* Command IDs start with `obi.`. Commands are registered with `register_command`.
* Texts shown to users go through `vscode.l10n.t` (in templates `get_text`) and need an entry in `l10n/bundle.l10n.json` and `l10n/bundle.l10n.de.json`.


# Updates

* Maintain `CHANGELOG.md`: every user-visible change goes under `[Unreleased]`.
* Update the user documentation in `asserts/docs` together with the behaviour.


# Features

Located in `docs/features/` (bugfixes in `docs/bugfix/`).

* Each feature has a status: `draft`, `ready` or `finished`
* Workflow from idea to spec: [improvements/README.md](improvements/README.md#workflow)
