# Error messages with cause and actions

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (wrong password still to be checked against an IBM i; new texts are English only, see localisation.md) | [usability.md U5](../improvements/usability.md#u5--error-messages-lack-the-cause-and-next-steps-questions-look-like-errors) | [typed-error-handling.md](typed-error-handling.md) (`get_error_message`) |

Used by many bugfix specs (`show_error`).


# Current situation

* 56 `showErrorMessage` calls. Many hide the cause, e.g. "Error occured during transfer to remote" ([OBITools.ts:982-985](../../src/extension/utilities/OBITools.ts#L982-L985)) or "Error occured during remote source check" ([OBITools.ts:330-331](../../src/extension/utilities/OBITools.ts#L330-L331)). The cause is only in the log.
* No message offers *Show log* or *Open configuration*.
* Errors are reported several times. `SSH_Tasks.connect` shows the error in two `catch` blocks and rethrows, and the caller shows it again, so one failed connection produces 2–3 notifications ([SSH_Tasks.ts:115-130](../../src/extension/utilities/SSH_Tasks.ts#L115-L130)).
* Yes/No questions use the red error style: [OBITools.ts:227](../../src/extension/utilities/OBITools.ts#L227), [261](../../src/extension/utilities/OBITools.ts#L261), [384](../../src/extension/utilities/OBITools.ts#L384), [397](../../src/extension/utilities/OBITools.ts#L397), [1005](../../src/extension/utilities/OBITools.ts#L1005).
* Typos in messages: "occured", "korrekt", "transfered", "Transer", "Dependend", "environmentd", "be build".


# New feature

## 1. Notification helper

New file `src/extension/utilities/Notify.ts`:

```ts
export interface NotifyAction { title: string; run: () => unknown; }

/** Logs the error with stack and shows one message with the cause. Ignores UserCancelledError. */
export async function show_error(message: string, error?: unknown, actions: NotifyAction[] = []): Promise<void>

/** Modal or non-modal question in warning style. Returns the chosen option or undefined (cancel). */
export async function ask<T extends string>(question: string, options: readonly T[], modal = true): Promise<T | undefined>
```

`show_error`:
* text: `${message}: ${get_error_message(error)}`, truncated to ~300 characters (the full text goes to the log);
* default actions: `Show log` (shows the OBI log channel);
* for `ConfigFileError` ([config-overwrite-on-parse-error.md](../bugfix/config-overwrite-on-parse-error.md)): `Open file` at line/column;
* for missing or invalid config: `Open configuration` (`obi.controller.config`);
* returns without UI for `UserCancelledError` ([input-cancel-shows-error.md](../bugfix/input-cancel-shows-error.md)).

## 2. Report errors once, at the boundary

* Low-level code (`SSH_Tasks`, `DirTool`, compile-list modules) **throws** and doesn't show messages.
* Entry points (commands, webview message handlers, startup tasks) catch and call `show_error`.
* Remove the `showErrorMessage` calls in `SSH_Tasks.connect` and similar places that rethrow.

## 3. Questions

Replace the error-style questions with `ask(...)` (warning style). Wording: say what will happen, e.g. "Transfer 12 changed sources to my-ibmi?" instead of "12 changed sources. Do you want to transfer to remote?".

## 4. Wording

Fix the typos above. Use the same terms as the docs (*build summary*, *source filter*, *profile*). Put new texts into `package.nls*.json` / l10n ([localisation.md](localisation.md)).


# Tests

* Unit test: `show_error('Transfer failed', new Error('Permission denied'))` → `showErrorMessage` called once with `Transfer failed: Permission denied` and the action `Show log`.
* Unit test: `show_error(…, new UserCancelledError())` → no message.
* Manual: wrong password → exactly one notification with cause and *Show log*.


### Definition of done
* `show_error` / `ask` exist and are used by all entry points
* No error is shown more than once; messages contain the cause
* Questions use warning style; typos fixed
* CHANGELOG entry
