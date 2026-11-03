# Local OBI process: exit handling and cancellation

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟠 | finished (Windows process tree kill not covered by tests) | [reliability.md R7](../improvements/reliability.md#r7--systemcmdexecution-resolves-after-rejecting-cancel-detection-is-dead-code) | [input-cancel-shows-error.md](input-cancel-shows-error.md) (`UserCancelledError`) |

Related: [features/command-injection-hardening.md](../features/command-injection-hardening.md). It switches to `shell: false`, which simplifies step 3. Both can be done in either order.


# Current situation

[SystemCmdExecution.ts](../../src/extension/utilities/SystemCmdExecution.ts):

* `exit` handler ([lines 38-47](../../src/extension/utilities/SystemCmdExecution.ts#L38-L47)): on `code !== 0` it calls `reject(...)`, then continues, logs "System command succeeded" and calls `resolve()`.
* The rejected `Error` has no `signal`/`code`, so the callers' cancel checks `error.signal === 'SIGTERM'` ([OBICommands.ts:149-153](../../src/extension/obi/OBICommands.ts#L149-L153), [OBIController.ts:82-85](../../src/webview/controller/OBIController.ts#L82-L85)) never match. A cancelled *Show changes* is reported as "System command failed".
* `abort_system_cmd` ([lines 57-62](../../src/extension/utilities/SystemCmdExecution.ts#L57-L62)) calls `child.kill()`. With `shell: true` that terminates only the shell (`/bin/sh` or `cmd.exe`), and the Python OBI child keeps running and writing to `.obi/tmp`.
* `processes[id]` is never deleted after a normal exit. A second run with the same id overwrites the entry silently.
* Lines 17-22 dump platform/env info via `console.log` on every call.
* Every stderr chunk is logged as `error`. Python logging writes INFO lines to stderr by default, so the error log fills with non-errors.


# Fix

## 1. Typed error

In `src/shared/Errors.ts` (next to `UserCancelledError`):

```ts
export class SystemCmdError extends Error {
  constructor(message: string,
              public readonly exit_code: number | null,
              public readonly signal: NodeJS.Signals | null) {
    super(message);
    this.name = 'SystemCmdError';
  }
}
```

## 2. Settle exactly once

```ts
public static async run_system_cmd(cwd: string, cmd: string, id: string): Promise<void> {
  if (SystemCmdExecution.processes[id])
    throw new Error(`Process '${id}' is already running`);

  const child = spawn(cmd, { cwd, shell: true, detached: process.platform !== 'win32' });
  SystemCmdExecution.processes[id] = child;

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      delete SystemCmdExecution.processes[id];
      const aborted = SystemCmdExecution.aborted.delete(id);
      if (aborted) return reject(new UserCancelledError(`${id} cancelled`));
      error ? reject(error) : resolve();
    };

    child.stdout.on('data', data => logger.debug(`${id} | stdout: ${data}`));
    child.stderr.on('data', data => logger.warn(`${id} | stderr: ${data}`));
    child.on('exit', (code, signal) => {
      if (code === 0) return finish();
      finish(new SystemCmdError(`${id} failed (exit code ${code}, signal ${signal}): ${cmd}`, code, signal));
    });
    child.on('error', err => finish(new SystemCmdError(`${id} could not be started: ${err.message}`, null, null)));
  });
}
```

* `private static aborted = new Set<string>()`
* Remove the `console.log` environment dump.

## 3. Kill the whole process tree

```ts
public static abort_system_cmd(id: string): void {
  const child = SystemCmdExecution.processes[id];
  if (!child?.pid) return;
  SystemCmdExecution.aborted.add(id);
  if (process.platform === 'win32')
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  else
    process.kill(-child.pid, 'SIGTERM');      // negative pid = process group (detached: true)
}

public static abort_all(): void {
  Object.keys(SystemCmdExecution.processes).forEach(id => SystemCmdExecution.abort_system_cmd(id));
}
```

`abort_all()` is called from `deactivate()` ([disposables-and-deactivate.md](disposables-and-deactivate.md)), because detached children would otherwise survive a window reload.

## 4. Callers

* Replace `error.signal === 'SIGTERM'` checks with `e instanceof UserCancelledError` → no error message (see [input-cancel-shows-error.md](input-cancel-shows-error.md)).
* `OBIController.check_obi_response` → `git pull`: show the stderr tail on failure instead of rethrowing inside a `then` (today an unhandled rejection).


# Tests

Integration tests with real child processes (no VS Code UI needed):
* `node -e "process.exit(0)"` → resolves.
* `node -e "process.exit(3)"` → rejects with `SystemCmdError`, `exit_code === 3`; nothing logs "succeeded".
* Long-running `node -e "setInterval(()=>{},1000)"` started via a shell that spawns a grandchild; `abort_system_cmd` → rejects with `UserCancelledError`, and the grandchild PID is gone (check via `process.kill(pid, 0)` throwing).
* Second start with the same id while running → throws.


### Definition of done
* Promise settles exactly once; failure is never logged as success
* Cancel produces `UserCancelledError` and kills the whole process tree on Linux, macOS and Windows
* `processes` map is cleaned up on exit
* No `console.log` in `SystemCmdExecution`; stderr logged as `warn`
* Tests pass on Linux and Windows CI; CHANGELOG entry
