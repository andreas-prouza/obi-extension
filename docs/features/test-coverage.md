**Status:** finished (Unreleased)

# Current situation

`src/test/suite/` only contains `AppConfig.test.ts` and `extension.test.ts`. There is no test
coverage for:
* Dependency-graph build ordering (`src/extension/obi/compile_list/modules/dependency.ts`)
* Compile-list merging / status reset (`src/extension/obi/compile_list/modules/add_sources.ts`)
* Cross-platform path handling (repeatedly the source of Windows-only bugfixes across the
  changelog: 0.3.33, 0.4.19, 0.4.20, 1.2.22, ...)
* SSH/remote sync logic (`src/extension/utilities/SSH_Tasks.ts`)

# New feature

## Expand automated test coverage

### Definition of done
* Add unit tests for `getBuildOrder()` / `removeDuplicities()` in `dependency.ts` covering
  multi-level dependency chains and cycles
* Add unit tests for `mergeSourcesIntoCompileList()` in `add_sources.ts`, including the status-reset
  behavior described in [build-summary.md](build-summary.md)
* Add unit tests for path normalization helpers (see repo memory `cross-platform-paths`) with both
  POSIX and Windows-style input paths, run on all platforms in CI
* Add a minimal SSH_Tasks test using a mocked `node-ssh` client
* Wire a coverage threshold into `npm test` so regressions in coverage are visible


## Result

* Build order: `DependencyOrder.test.ts` and `DependencyGraph.test.ts` (multi-level chains, cycles). Adding sources: `AddSources.test.ts`, including the status reset. Paths: `SourcePath.test.ts`, `DirTool` suite, on Linux and Windows in CI. SSH: `SSH_Tasks.test.ts`, `SshLogin.test.ts`, `Transfer.test.ts`, `HostKeyVerification.test.ts` with a mocked `node-ssh`.
* `npm run test:coverage` (`c8`, in CI on Linux) measures the code the tests run in the VS Code extension host. Thresholds in `.c8rc.json`, just below the current values: lines 73.6 %, branches 80.7 %, functions 71.9 %. Raise them when coverage grows.
* Page scripts (`src/webview/**/javascript`) run in the browser part of the webview and aren't measured.
