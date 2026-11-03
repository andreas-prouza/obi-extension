# File links in remote workspaces

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟡 | finished (integration tests with stubbed workspace URI; Remote-SSH/WSL still to be checked manually) | [reliability.md R12](../improvements/reliability.md#r12--remote-workspace-file-uris-are-built-by-hand) | – |


# Current situation

`DirTool.get_file_URI` ([DirTool.ts:269-286](../../src/extension/utilities/DirTool.ts#L269-L286)) builds a URI-like object by hand:

```ts
let scheme = 'file', remote_ws_host = '';
if (vscode.env.remoteName) {
  scheme = 'vscode-remote';
  remote_ws_host = AppConfig.get_app_config().general['cloud-ws-ssh-remote-host'] || vscode.env.remoteName;
}
return { scheme, path: path.join(Workspace.get_workspace(), file), authority: remote_ws_host };
```

* `vscode.env.remoteName` is the **kind** of remote (`ssh-remote`, `wsl`, `dev-container`, `codespaces`), not the authority (`ssh-remote+myhost`, `wsl+Ubuntu`, …). Links in remote windows only work if the user sets `cloud-ws-ssh-remote-host` ([config_details.html:69-70](../../asserts/templates/controller/config_details.html#L69-L70), [configuration.md](../../asserts/docs/configuration.md)).
* `path.join` produces backslashes on Windows clients, which are not valid in a URI path.
* The function is used in 22 places: `command:vscode.open?…` links in templates (via `get_encoded_file_URI`, `get_encoded_source_URI`, `get_encoded_build_output_URI`) and tree item commands ([SourceListProvider.ts:667-673](../../src/webview/source_list/SourceListProvider.ts#L667-L673)).


# Fix

## 1. Derive URIs from the workspace folder

```ts
public static get_file_URI(file: string): vscode.Uri {
  return vscode.Uri.joinPath(Workspace.get_workspace_uri(), ...file.split(/[\\/]+/).filter(s => s.length > 0));
}

public static get_encoded_file_URI(file: string): string {
  return encodeURIComponent(JSON.stringify(DirTool.get_file_URI(file).toJSON()));
}
```

`workspaceFolders[0].uri` already has the correct scheme and authority for local, SSH, WSL, dev container and codespaces windows.

## 2. Callers

* Tree items pass the `vscode.Uri` directly as command argument.
* Templates keep using the encoded form. Verify that `vscode.open` accepts the serialized `Uri` JSON (it revives `$mid` objects).
* `BuildHistoryProvider` already uses `vscode.Uri.joinPath` ([BuildHistoryProvider.ts:151-155](../../src/webview/build_history/BuildHistoryProvider.ts#L151-L155)), which is the reference.

## 3. Deprecate `cloud-ws-ssh-remote-host`

* Remove the field from [config_details.html](../../asserts/templates/controller/config_details.html) and from `ConfigGeneral`.
* Ignore the key if it is still present in a TOML file (no error).
* Mark it as deprecated in [configuration.md](../../asserts/docs/configuration.md) with a note that it's no longer needed.


# Tests

* Unit test (with a stubbed workspace folder `vscode-remote://ssh-remote+host/home/u/ws`): `get_file_URI('.obi/etc/app-config.toml').toString()` → `vscode-remote://ssh-remote%2Bhost/home/u/ws/.obi/etc/app-config.toml`.
* Unit test: input with backslashes `src\\lib\\x.pgm` → path `/…/src/lib/x.pgm`.
* Manual: open a project via Remote-SSH and click *open JSON file* in the build summary and a source in the source filter tree.


### Definition of done
* No hand-built URI objects; all file links derive from the workspace folder URI
* Links work in local, Remote-SSH and WSL windows without extra configuration
* `cloud-ws-ssh-remote-host` removed from UI and docs (ignored if present)
* CHANGELOG entry
