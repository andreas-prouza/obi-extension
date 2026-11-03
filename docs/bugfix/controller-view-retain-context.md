# OBI Build view loses its state and can duplicate message listeners

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟡 | finished | [reliability.md R10](../improvements/reliability.md#r10--obi-build-view-retaincontextwhenhidden-has-no-effect-re-resolving-adds-message-listeners) | [operation-lock.md](operation-lock.md) (running state) |

Related: [features/webview-state-updates.md](../features/webview-state-updates.md).


# Current situation

* [OBIController.ts:177](../../src/webview/controller/OBIController.ts#L177) sets `(webviewView as any).retainContextWhenHidden = true`. `WebviewView` has no such property, so VS Code ignores it. The option has to be passed when the provider is registered ([extension.ts:254-257](../../src/extension.ts#L254-L257)).
* As a result, VS Code drops the view's page when it is hidden (other side bar container, collapsed section) and calls `resolveWebviewView` again when it becomes visible. The "running" ring that was shown for an active build ([controller.ts:85-123](../../src/webview/controller/javascript/controller.ts#L85-L123)) is gone, although the build is still running.
* `resolveWebviewView` registers `webviewView.webview.onDidReceiveMessage(...)` every time it runs ([OBIController.ts:206](../../src/webview/controller/OBIController.ts#L206)), without disposing the previous listener. For a **new** webview that is harmless. For the **same** view, it duplicates the handlers. That happens via `OBIController.update()` ([OBIController.ts:45-55](../../src/webview/controller/OBIController.ts#L45-L55)) and the `refresh` message ([OBIController.ts:213-215](../../src/webview/controller/OBIController.ts#L213-L215)). Neither has a caller in the UI today, but enabling either would make every later click run several times.


# Fix

## 1. Register with the option

```ts
context.subscriptions.push(
  vscode.window.registerWebviewViewProvider(OBIController.viewType, obi_controller_provider, {
    webviewOptions: { retainContextWhenHidden: true }
  })
);
```

Remove the cast at line 177.

## 2. Separate rendering from wiring

```ts
private _message_listener?: vscode.Disposable;

public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken) {
  this._view = webviewView;
  webviewView.webview.options = { … };
  this.render();                                   // only sets webview.html

  this._message_listener?.dispose();
  this._message_listener = webviewView.webview.onDidReceiveMessage(data => this.on_message(data));
  webviewView.onDidDispose(() => { this._message_listener?.dispose(); this._view = undefined; });

  this.post_state();
}
```

* `OBIController.update()` and the `refresh` message call `render()` + `post_state()` only, never `resolveWebviewView`.
* `post_state()` sends the current profile list, build summary timestamp **and** `running: OperationLock.running`. The page shows or hides the running ring based on that, not only based on its own click.
* Subscribe once to `OperationLock.on_did_change` and call `post_state()`, so the ring also appears for builds started from the editor title or the build summary.

## 3. Page script

In [controller.ts](../../src/webview/controller/javascript/controller.ts), handle a `state` message: `running` → show the ring with the label as tooltip; `undefined` → hide it. Keep the existing `run_finished` handling for compatibility until all senders use `state`.


# Tests

* Manual: start *Run build*, switch to the Explorer side bar and back → the running ring is still visible; after the build it disappears.
* Unit test (stubbed `WebviewView`): calling `resolveWebviewView` twice on the same view and then firing one message → handler runs once.


### Definition of done
* `retainContextWhenHidden` is passed at registration; the cast is removed
* Exactly one message listener per webview
* Running state is restored from `OperationLock` whenever the view (re)renders
* CHANGELOG entry
