# Contributing to OBI

OBI is a VS Code extension written in TypeScript. It generates and runs build commands for IBM i.


## Set up

You need:

* Node.js: the version in [.nvmrc](.nvmrc)
* VS Code 1.90 or newer (the minimum version in `engines.vscode`)

```sh
npm ci
npm run compile
```

Press **F5** in VS Code to start *Run Extension*. `npm run watch` rebuilds on every change.


## Test

| Command | What it does |
|---|---|
| `npm run test:unit` | Modules without `vscode` imports, in plain Node. Fast |
| `npm test` | Everything, in a real VS Code instance, against a temporary copy of `test-resources/appconfig` |
| `npm run test:coverage` | The same with a coverage report in `coverage/`. It fails below the thresholds in `.c8rc.json` |
| `npm run typecheck` | TypeScript, without output |
| `npm run lint:ci` | ESLint. It fails if the number of warnings is above the baseline in `package.json` |
| `npm run check:repo` | Project rules: commands, translations, templates |

On Linux without a display, use `xvfb-run -a npm test`. `VSCODE_TEST_VERSION=1.90.0 npm test` runs against a specific VS Code version. CI runs all of this on Linux and Windows, and the tests also on the minimum VS Code version.

To debug a test, use the launch configuration *Extension Tests*.

If you change what the build list generates on purpose, update the golden file with `OBI_UPDATE_GOLDEN=1 npm test` and check the diff of `test-resources/golden/compile-list.json`.


## Package

```sh
npm run package:vsix
```

This builds the bundle in production mode and creates the `.vsix`. Runtime dependencies are bundled, so the package contains no `node_modules`.


## Rules

The full rules are in [docs/architecture.md](docs/architecture.md). In short:

* **Security comes first.** Quote values for the remote shell with `sh_quote`, validate messages from webviews with the message tables in `src/shared/messages`, and never write secrets to logs or files.
* **Structure:** `shared/` has pure code and imports nothing from `extension/` or `webview/`; `extension/` is the logic; `webview/` the pages and views; `extension.ts` and `file_callbacks.ts` wire them together.
* **TypeScript:** no new `any`. Put logic that doesn't need VS Code into a module without a `vscode` import, so it can be unit-tested.
* **npm packages** need a GitHub repository, several forks and at least 200 stars, and no known security problems. If none qualifies, ask first. Checked packages are listed in [docs/architecture.md](docs/architecture.md#reviewed-packages).
* **GUI:** use native VS Code icons where possible, and Nunjucks templates for HTML. Webviews have a strict CSP: no inline scripts or event handlers.
* **Commands and settings** must be declared in `package.json`. Register commands with `register_command`.
* **Texts** shown to users go through `vscode.l10n.t` and need an entry in `l10n/bundle.l10n.json` and `l10n/bundle.l10n.de.json`.
* **[CHANGELOG.md](CHANGELOG.md):** add every user-visible change under `[Unreleased]`.
* **User documentation** is in `asserts/docs`. Update it together with the behaviour.


## Specs

Larger changes are planned in the repository:

1. Ideas: short entries in [docs/improvements](docs/improvements/README.md).
2. Specs: [docs/features](docs/features) and [docs/bugfix](docs/bugfix), each with a status of `draft`, `ready` or `finished`.
3. Known bugs: [docs/bugs.md](docs/bugs.md).

Finished specs move to `done/` in their folder. The [workflow](docs/improvements/README.md#workflow) has the details.
