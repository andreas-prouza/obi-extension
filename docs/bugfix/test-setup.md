# Make the tests runnable

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🔴 | finished (verified on Linux; Windows not yet) | [maintainability.md M1](../improvements/maintainability.md#m1--npm-test-cannot-run), [M2](../improvements/maintainability.md#m2--compiling-the-tests-overwrites-the-extension-bundle) | – |

Prerequisite for most other specs. Followed by [features/continuous-integration.md](../features/continuous-integration.md) and [features/test-coverage.md](../features/test-coverage.md).


# Current situation

* `npm test` runs `pretest` = `compile-tests && lint`:
  * `tsc -p ./` fails with **19 errors**: 15 because `mocha` / `@types/mocha` are not installed and `tsconfig.json` restricts `types` to `["vscode-webview"]`; 4 real errors in [OBIConfiguration.ts:244](../../src/webview/controller/OBIConfiguration.ts#L244) and [show_changes.ts:84-87](../../src/webview/show_changes/javascript/show_changes.ts#L84-L87).
  * `eslint src/` fails with 453 errors.
  * `test:fast` stops at the same `tsc` errors.
* `tsc -p ./` uses `outDir: out`, `rootDir: src`, so it **overwrites** the esbuild bundle `out/extension.js` with unbundled output.
* Two runner configs: [.vscode-test.mjs](../../.vscode-test.mjs) (`@vscode/test-cli`, not installed, wrong `extensionDevelopmentPath`) and [runTest.ts](../../src/test/runTest.ts) (`@vscode/test-electron`, installed).
* The tests use the tracked folder `test-workspace-active/` as workspace and call `fs.emptyDir()` on it ([AppConfig.test.ts:16-22](../../src/test/suite/AppConfig.test.ts#L16-L22), [GitInfo.test.ts](../../src/test/suite/GitInfo.test.ts)). Running the tests deletes and rewrites tracked files.
* The *Extension Tests* launch config ([launch.json](../../.vscode/launch.json)) points to `out/test/suite/index` but its `preLaunchTask` (`npm: watch`) only runs esbuild, so the tests are never compiled by F5.
* `chai` is installed but unused.


# Fix

## 1. Dependencies

* Add dev dependencies `mocha` and `@types/mocha`. Both are widely used; check them against the [package criteria](../architecture.md#npm) as usual.
* Keep `sinon` + `@types/sinon` (used by the new unit tests in the other specs). Remove `chai` (see [features/dependency-hygiene.md](../features/dependency-hygiene.md)).

## 2. Separate test build

`tsconfig.test.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "out-test",
    "rootDir": "src",
    "types": ["mocha", "node", "vscode-webview"]
  },
  "include": ["src/**/*"],
  "exclude": ["src/webview/**/javascript/**"]
}
```

* `tsconfig.json` is only used for type checking (`noEmit`) by `npm run typecheck`.
* Add `out-test/` to `.gitignore` and `out-test/**` to `.vscodeignore`.

## 3. Fix the 4 compile errors

* `ConfigGlobal.variables`: change the type from `{["key"]: string}` to `Record<string, string | string[]>` (variables can be lists, see `add_global_variable`). Do the same for `cmds` / `compile-cmds` (`Record<string, string>`) and `steps` (`Record<string, string[]>`).
* `show_changes.ts`: `document.querySelectorAll<HTMLElement>('.' + targetClass)`.

## 4. Scripts

```json
"typecheck":     "tsc -p ./ --noEmit",
"compile-tests": "tsc -p ./tsconfig.test.json",
"watch-tests":   "tsc -p ./tsconfig.test.json --watch",
"pretest":       "npm run compile && npm run compile-tests",
"test":          "node ./out-test/test/runTest.js",
"lint":          "eslint src/"
```

* `lint` is no longer part of `pretest`. It runs as its own CI step with a baseline ([continuous-integration.md](../features/continuous-integration.md)).
* Remove `test:fast` (same as `test` now) or keep it as `compile-tests && test` without `compile`.

## 5. One runner, temporary workspace

* Delete `.vscode-test.mjs`.
* `runTest.ts`: copy `test-resources/appconfig` into a fresh temp folder (`fs.mkdtemp(path.join(os.tmpdir(), 'obi-test-'))`) and pass it as workspace, with `--disable-extensions`. Delete the folder afterwards.
* Remove the tracked `test-workspace-active/` folder from git (fixtures live in `test-resources/`).
* `suite/index.ts`: glob `**/*.test.js` relative to `out-test/test`.

## 6. Debugging

* Add a task `npm: compile-tests` and a compound `preLaunchTask` (`npm: watch` + `npm: watch-tests`) for *Extension Tests*.
* Point `extensionTestsPath` and `outFiles` to `out-test`, and pass the same temp workspace (or a `test-resources` copy) as argument.


# Tests

The existing suites (`AppConfig`, `GitInfo`, `extension`) must pass via `npm test` on a clean checkout.


### Definition of done
* `npm ci && npm test` passes on a clean checkout (Linux, Windows)
* Running the tests doesn't modify tracked files (`git status` clean afterwards)
* `out/extension.js` is always the esbuild bundle
* One test runner; *Extension Tests* launch config works with F5
* 4 compile errors fixed; `npm run typecheck` passes
* CHANGELOG entry (development section)
