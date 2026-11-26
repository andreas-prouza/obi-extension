# run_system_cmd resolves on exit, before the output is read completely

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟡 | finished (integration tests in SystemCmdExecution.test.ts; the exit/output race itself could not be reproduced on Linux) | [improvements v2.2.3 R5](../improvements/v2.2.3/README.md), [system-cmd-exit-handling.md](system-cmd-exit-handling.md) | – |


# Current situation

`SystemCmdExecution.run_system_cmd` ([SystemCmdExecution.ts](../../src/extension/utilities/SystemCmdExecution.ts)) settled its promise on the child's `exit` event, and flushed the last (unterminated) output line on `close`.

* Node.js documents that stdio may still be open when `exit` fires. A caller that reads its lines after the `await`, like `BackendUpdate.pull_local` with `git rev-parse HEAD` (`stdout[0]`), could then miss the end of the output. In tests on Linux (200 runs of `git rev-parse HEAD`, 50 runs with 200,000 lines) `exit` never came before the last output, so this is a latent bug here; it depends on platform and load.
* Reproducible: a process started by the program that inherits its output (the program runs in its own process group) keeps the pipes open. `close` then only came when that process ended: output written after the program's exit still reached `on_line` after the promise had resolved, and the cancel subscription stayed registered until then.
* On Windows, the `taskkill` spawn of `abort_system_cmd` had no `error` listener.


# Fix

* The promise settles on `close` (exit code and signal from there), after flushing both line buffers, so the last line without a line break arrives before the caller continues.
* Fallback: `CLOSE_AFTER_EXIT_MS` (2 s) after `exit` it settles anyway with the exit code, and the pipes are destroyed.
* Output after the promise settled isn't passed to `on_line`.
* Cancel subscription and process entry are removed when the promise settles.
* `taskkill` gets an `error` listener (logged).


# Tests

Integration ([SystemCmdExecution.test.ts](../../src/test/suite/SystemCmdExecution.test.ts)), in addition to the existing ones (exit codes, abort with child processes, arguments):

* 20 runs of 2,000 lines plus a last line without a line break: all 2,001 lines arrive before the promise resolves.
* A grandchild that inherits stdout and writes after the program's exit: the promise resolves shortly after the exit (`CLOSE_AFTER_EXIT_MS` = 300 ms in the test); the late line isn't passed on.


# Definition of done

* [x] Fix and tests
* [x] No user docs or CHANGELOG entry: not visible to users in normal use
* [x] Entry R5 removed from the improvement list
