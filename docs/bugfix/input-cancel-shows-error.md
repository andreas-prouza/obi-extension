# Cancelling an input shows an error

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟠 | finished | [usability.md U3](../improvements/usability.md#u3--pressing-escape-in-an-input-box-shows-an-error) | – |

Pairs with [features/typed-error-handling.md](../features/typed-error-handling.md) and [features/error-messages.md](../features/error-messages.md).


# Current situation

Pressing Escape in an input box or dialog throws an `Error`. The command handlers don't catch it, so VS Code reports a failed command for a normal cancel:

| Place | Throw |
|---|---|
| [SourceListProvider.ts:197-198](../../src/webview/source_list/SourceListProvider.ts#L197-L198) | add source filter |
| [SourceListProvider.ts:219-220](../../src/webview/source_list/SourceListProvider.ts#L219-L220) | add source folder |
| [SourceListProvider.ts:261-262](../../src/webview/source_list/SourceListProvider.ts#L261-L262) | add source member |
| [SourceListProvider.ts:329-331](../../src/webview/source_list/SourceListProvider.ts#L329-L331) | change description |
| [SourceListProvider.ts:361-363](../../src/webview/source_list/SourceListProvider.ts#L361-L363) | rename member |
| [OBIController.ts:286-287](../../src/webview/controller/OBIController.ts#L286-L287) | copy profile |
| [SSH_Tasks.ts:32-33](../../src/extension/utilities/SSH_Tasks.ts#L32-L33), [SSH_Tasks.ts:92-93](../../src/extension/utilities/SSH_Tasks.ts#L92-L93), [SSH_Tasks.ts:102-103](../../src/extension/utilities/SSH_Tasks.ts#L102-L103) | user / host / password prompt |
| [SSH_Tasks.ts:278-286](../../src/extension/utilities/SSH_Tasks.ts#L278-L286), [OBITools.ts:1009-1015](../../src/extension/utilities/OBITools.ts#L1009-L1015) | transfer dialogs (additionally show "Transfer canceled by user" as an **error** message) |
| [OBITools.ts:930-933](../../src/extension/utilities/OBITools.ts#L930-L933) | cancel during hash calculation |

In addition, *Change description* treats an empty input (meant to remove the description) as a cancel ([SourceListProvider.ts:329](../../src/webview/source_list/SourceListProvider.ts#L329)).


# Fix

## 1. A dedicated error type for deep call chains

New file `src/shared/Errors.ts`:

```ts
/** Thrown when the user cancels a prompt in the middle of a longer operation. Never shown as an error. */
export class UserCancelledError extends Error {
  constructor(message: string = 'Cancelled by user') {
    super(message);
    this.name = 'UserCancelledError';
  }
}
```

* Throw it in `SSH_Tasks` (user, host, password prompt; transfer confirmation) and in `retrieve_current_source_hashes`, because these happen deep inside a build.
* Every top-level handler that catches errors (`rerun_build`, `show_changes`, `transfer_project_folder`, `check_remote_sources`, `get_remote_source_list`, `reset_compiled_object_list`, `BuildSummary.add_sources`) checks `e instanceof UserCancelledError` first and then only logs at `info` level. No message is shown, or at most a status bar message "Cancelled" for 3 s.

## 2. Plain return for direct UI commands

In `SourceListProvider` and `OBIController.copy_current_profile`, when `showInputBox` returns `undefined`, `return undefined;` instead of throwing. The callers already handle `undefined` (`if (source_list) …`).

## 3. Description: distinguish clear from cancel

```ts
if (new_description === undefined)
  return;                     // cancelled
LocalSourceList.update_source_infos(source_path, member, new_description);  // '' removes the description
```

`update_source_infos` already removes the entry for an empty description.

## 4. Transfer dialogs

Remove the `showErrorMessage('Transfer canceled by user')` calls ([OBITools.ts:1010](../../src/extension/utilities/OBITools.ts#L1010), [OBITools.ts:1014](../../src/extension/utilities/OBITools.ts#L1014)) and throw `UserCancelledError` instead.


# Tests

* Unit test: `rerun_build` with a mocked `run_build_process` throwing `UserCancelledError` → `vscode.window.showErrorMessage` is not called (sinon stub).
* Manual: press Escape in each prompt listed above; no error notification appears.


### Definition of done
* `UserCancelledError` exists and is used for cancels inside long operations
* No error notification after pressing Escape in any prompt listed above
* Clearing a description removes it
* CHANGELOG entry
