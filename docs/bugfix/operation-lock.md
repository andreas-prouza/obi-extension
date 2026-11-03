# One lock for all build-related operations

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟠 | finished (commands use `enablement: !obi.busy` instead of `when` clauses) | [reliability.md R6](../improvements/reliability.md#r6--operation-guards-race-and-dont-cover-each-other) | – |

Used by: [controller-view-retain-context.md](controller-view-retain-context.md), [features/status-bar.md](../features/status-bar.md), [features/remote-build-output-and-cancel.md](../features/remote-build-output-and-cancel.md).


# Current situation

Six independent status flags guard the operations:

| Flag | Where |
|---|---|
| `run_build_status`, `show_changes_status`, `remote_source_list_status`, `reset_compiled_object_list_status` | [OBICommands.ts:26-29](../../src/extension/obi/OBICommands.ts#L26-L29) |
| `check_remote_sources_status`, `transfer_all_status` | [OBITools.ts:28-29](../../src/extension/utilities/OBITools.ts#L28-L29) |

Problems:
* `run_build` checks `run_build_status` but doesn't set it. It is only set inside `rerun_build`, after `show_changes` has finished ([OBICommands.ts:296-326](../../src/extension/obi/OBICommands.ts#L296-L326)). Two quick clicks start two runs; the second then fails in `show_changes` with "OBI process is already running".
* Different operations can run at the same time: e.g. *Show changes* (`generate_source_change_lists` deletes `.obi/tmp` and `.obi/build-output`) while a build is downloading results into the same folders, or *Transfer all* during a build.
* `BuildSummary.add_sources` / `edit_cmd` rewrite `compile-list.json` while a build may be reading it.
* Some error paths return without resetting a flag. For example, `get_remote_source_list` resets it in `catch` and rethrows, but its callers handle errors differently.


# Fix

## 1. `OperationLock`

New file `src/extension/utilities/OperationLock.ts`:

```ts
import * as vscode from 'vscode';

export class OperationLock {

  private static current: string | undefined;
  private static readonly _on_did_change = new vscode.EventEmitter<string | undefined>();
  /** Fires with the running operation's label, or undefined when idle. */
  public static readonly on_did_change = OperationLock._on_did_change.event;

  public static get running(): string | undefined {
    return OperationLock.current;
  }

  /** Runs fn exclusively. Returns undefined (and informs the user) if another operation is running. */
  public static async run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (OperationLock.current) {
      vscode.window.showWarningMessage(`OBI is busy: ${OperationLock.current}. Please wait until it has finished.`);
      return undefined;
    }
    OperationLock.set(label);
    try {
      return await fn();
    } finally {
      OperationLock.set(undefined);
    }
  }

  private static set(label: string | undefined): void {
    OperationLock.current = label;
    vscode.commands.executeCommand('setContext', 'obi.busy', label !== undefined);
    OperationLock._on_did_change.fire(label);
  }
}
```

## 2. Split entry points from implementations

Only **user-facing entry points** acquire the lock. Internal calls use the unlocked implementation, so nested calls (build → show changes, remote check → transfer) don't deadlock:

| Entry point (locks) | Calls internally (no lock) |
|---|---|
| `OBICommands.run_build` / `run_single_build` — "Run build" | `do_show_changes`, `do_rerun_build`, `run_build_process` → `OBITools.check_remote` → `do_transfer_project_folder` |
| `OBICommands.rerun_build` (build summary button) — "Run build" | `do_rerun_build` |
| `OBICommands.show_changes` / `show_single_changes` — "Show changes" | `do_show_changes` |
| `OBICommands.get_remote_source_list` — "Get remote source list" | `do_get_remote_source_list` |
| `OBICommands.reset_compiled_object_list` — "Reset object list" | – |
| `OBICommands.get_remote_build_results` — "Get build results" | – |
| `OBITools.check_remote_sources` (command and startup) — "Remote source check" | `process_check_remote_sources` → `do_get_remote_source_list`, `do_transfer_project_folder` |
| `OBITools.transfer_project_folder` (command) — "Transfer" | `do_transfer_project_folder` |
| `BuildSummary.add_sources`, `BuildSummary.edit_cmd` — "Edit build summary" | – |

* Remove the six status fields and the "already running" checks.
* `OBIController.run_finished(...)` stays where it is today (called from the entry point after the lock has been released, in `finally`).

## 3. UI

* Use `!obi.busy` in the `when` clauses of the commands in `menus.view/title` and `menus.editor/title` that start one of the operations above (run build, show changes, transfer, reset object list, add source).
* The OBI Build view gets the busy state via `on_did_change` (see [controller-view-retain-context.md](controller-view-retain-context.md)).


# Tests

* Unit test: two concurrent `OperationLock.run('A', …)` calls → the second returns `undefined` immediately and the first completes; afterwards `running` is `undefined`, also if `fn` throws.
* Unit test: an entry point calling another entry point's `do_*` implementation doesn't hit the lock.


### Definition of done
* All six status flags are replaced by `OperationLock`
* Every entry point listed above runs inside `OperationLock.run`, internal calls don't
* `obi.busy` context key is maintained and used in menus
* Lock is always released (also on errors and cancellation)
* Unit tests pass; CHANGELOG entry
