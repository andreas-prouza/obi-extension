# Continuous integration

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (not yet run on GitHub; template/CSP and `workspaceFolders[0]` checks follow with their specs; VSIX limit 5600 until vsix-package-size; no CONTRIBUTING.md yet) | [maintainability.md M3](../improvements/maintainability.md#m3--no-continuous-integration) | [bugfix/test-setup.md](../bugfix/test-setup.md) |

Collects the CI checks requested by other specs.


# Current situation

* There is no `.github/workflows` folder. Type check, lint, tests and packaging only run on a developer machine, if at all (`npm test` doesn't run today, see [test-setup.md](../bugfix/test-setup.md)).
* The [CHANGELOG](../../CHANGELOG.md) shows repeated Windows-only fixes (0.3.33, 0.4.19, 0.4.20, 1.2.22, 1.2.23, …).
* `npm run lint` reports 453 errors, so it can't be a blocking check yet.


# New feature

## 1. Workflow `.github/workflows/ci.yml`

Triggers: `push` to `main`, all pull requests.

```yaml
jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint:ci
      - run: npm run compile
      - run: npm run compile-tests
      - run: xvfb-run -a npm test
        if: runner.os == 'Linux'
      - run: npm test
        if: runner.os == 'Windows'
      - run: npm run check:repo
      - run: npm audit --omit=dev --audit-level=high
        if: runner.os == 'Linux'
      - run: npx vsce ls > vsix-files.txt && node scripts/check-vsix-size.js vsix-files.txt
        if: runner.os == 'Linux'
```

* `.nvmrc` pins the Node version (the major version VS Code's Electron uses for the targeted engine, see [vscode-engine-bump.md](vscode-engine-bump.md)).
* Pin action versions (major tags or commit SHAs). Dependabot keeps them updated.

## 2. Lint with a shrinking baseline

ESLint has no built-in baseline. Use warnings plus a maximum:
* In [eslint.config.mjs](../../eslint.config.mjs), downgrade the rules with existing violations (`@typescript-eslint/no-explicit-any`, `prefer-const`, `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-require-imports`, `no-case-declarations`, …) to `warn`.
* Script `"lint:ci": "eslint src/ --max-warnings <current count>"`. New violations fail CI; every PR that fixes warnings lowers the number.
* Once a rule reaches 0 warnings, switch it back to `error`.

## 3. Repository checks (`npm run check:repo`)

One script `scripts/check-repo.js` runs the small checks from other specs:

| Check | From |
|---|---|
| no `{{` inside `on…="…"` attributes; no `<script>` without `src`; every page template includes `tools/csp.html` | [source-description-xss.md](../bugfix/source-description-xss.md), [webview-csp.md](webview-csp.md) |
| no `registerCommand(` outside `Registration.ts` | [disposables-and-deactivate.md](../bugfix/disposables-and-deactivate.md) |
| every `%key%` / l10n key exists in all language files | [localisation.md](localisation.md) |
| every command in `contributes.commands` is registered or hidden from the palette | [bugs.md #9](../bugs.md#9--contributed-commands-that-are-not-registered) |
| no `"latest"` versions in `package.json` | [pin-dependency-versions.md](pin-dependency-versions.md) |
| no `workspaceFolders[0]` outside `Workspace.ts` | [multi-root-workspace.md](multi-root-workspace.md) |

## 4. Dependabot

`.github/dependabot.yml`: `npm` (weekly, grouped minor/patch updates) and `github-actions` (monthly).

## 5. Package size check

`scripts/check-vsix-size.js` fails if `vsce ls` lists more files than a threshold (set after [vsix-package-size.md](vsix-package-size.md), e.g. 500).

## 6. Release (later)

Optional follow-up: a workflow on version tags that runs the same checks and publishes with `vsce publish` / `ovsx publish`, using repository secrets. Not part of this spec's definition of done.


### Definition of done
* CI runs on Linux and Windows for every PR and push to `main`
* Type check, lint (with baseline), build, tests, repo checks, audit and package size check are part of it
* Dependabot configured
* README badge (optional) and a short CI section in `CONTRIBUTING.md` ([repository-hygiene.md](repository-hygiene.md))
