# Missing `deactivate()` and unregistered disposables

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟡 | finished (the regression check is part of `npm run check:repo`; tree event emitters are disposed, other module-level emitters are not) | [reliability.md R14](../improvements/reliability.md#r14--missing-deactivate-and-many-disposables-are-never-registered) | – |

Related: [system-cmd-exit-handling.md](system-cmd-exit-handling.md) (`abort_all`).


# Current situation

* [extension.ts](../../src/extension.ts) exports no `deactivate()`. The SSH connection (`SSH_Tasks.ssh`) and running local OBI processes are not cleaned up on window reload or extension shutdown.
* 38 `registerCommand` calls exist; many results are not added to `context.subscriptions`:
  * [extension.ts:292](../../src/extension.ts#L292), [317](../../src/extension.ts#L317), [341](../../src/extension.ts#L341)
  * all commands in `SourceListProvider.register` ([SourceListProvider.ts:478-532](../../src/webview/source_list/SourceListProvider.ts#L478-L532))
  * all commands in `BuildHistoryProvider.register` ([BuildHistoryProvider.ts:497-541](../../src/webview/build_history/BuildHistoryProvider.ts#L497-L541)). There the tree view itself isn't pushed either (only in the commented-out block).
* Not disposed either: the `onDidChangeActiveTextEditor` listener ([SourceListProvider.ts:456](../../src/webview/source_list/SourceListProvider.ts#L456)), the config watchers in `reload_obi_extension_on_config_change` ([OBITools.ts:1086-1097](../../src/extension/utilities/OBITools.ts#L1086-L1097)), the diagnostic collection ([compile-diagnostics.ts:63-65](../../src/extension/source/compile-diagnostics.ts#L63-L65)), the "OBI" output channel ([Logger.ts:9](../../src/extension/utilities/Logger.ts#L9)) and the event emitters of the tree providers.
* `SourceListProvider.register` registers the tree twice: `registerTreeDataProvider('obi.source-filter', this)` **and** `createTreeView('obi.source-filter', …)` ([SourceListProvider.ts:451-454](../../src/webview/source_list/SourceListProvider.ts#L451-L454)).

Today this mostly matters on extension updates and in tests (extension host reuse). It becomes important once the window no longer reloads on config changes ([features/reload-free-config-changes.md](../features/reload-free-config-changes.md)), because the extension then has to re-initialise in place.


# Fix

## 1. Registration helper

```ts
// src/extension/utilities/Registration.ts
export function register_command<A extends unknown[]>(context: vscode.ExtensionContext, id: string,
                                                      handler: (...args: A) => unknown): void {
  context.subscriptions.push(vscode.commands.registerCommand(id, handler));
}
```

(The generic keeps typed handlers such as `(item: SourceListItem) => …` assignable without `any`.)

* Replace every `vscode.commands.registerCommand(` and `context.subscriptions.push(vscode.commands.registerCommand(` with `register_command(context, …)`.
* Push `createTreeView` results, `onDidChange…` listeners, file watchers, the diagnostic collection and the output channel to `context.subscriptions`. Give `reload_obi_extension_on_config_change` and `compile-diagnostics` a `context` parameter or an `init(context)` function.
* Remove `registerTreeDataProvider` from `SourceListProvider.register`.

## 2. `deactivate()`

```ts
export async function deactivate(): Promise<void> {
  SystemCmdExecution.abort_all();
  await SSH_Tasks.disconnect();
}
```

with `SSH_Tasks.disconnect()`:

```ts
public static async disconnect(): Promise<void> {
  if (SSH_Tasks.ssh.isConnected()) SSH_Tasks.ssh.dispose();
}
```

## 3. Guard against regressions

Add a check to the CI lint step ([features/continuous-integration.md](../features/continuous-integration.md)): `grep -rn "registerCommand(" src | grep -v Registration.ts` must be empty.


# Tests

* Integration test: activate the extension, record `context.subscriptions.length`, and assert that every command id from `package.json` `contributes.commands` is registered (`vscode.commands.getCommands(true)`). This also covers [bugs.md #9](../bugs.md#9--contributed-commands-that-are-not-registered).


### Definition of done
* `deactivate()` closes SSH and aborts local processes
* Every command, view, watcher, listener, output channel and diagnostic collection is added to `context.subscriptions`
* Source filter tree is registered once
* CI check against unregistered `registerCommand`
* CHANGELOG entry
