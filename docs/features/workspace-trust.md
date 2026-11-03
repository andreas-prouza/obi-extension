# Workspace Trust

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (Restricted Mode still to be checked manually) | [security.md S8](../improvements/security.md#s8--workspace-provided-nunjucks-template-runs-in-the-extension-host) | – |


# Current situation

* A cloned repository controls several things that end up as code:
  * `.obi/.vscode/templates/custom_build_list_template.html` is included into the build summary ([BuildSummary.ts:368-371](../../src/webview/show_changes/BuildSummary.ts#L368-L371), [show_changes/index.html:28](../../asserts/templates/show_changes/index.html#L28)). Nunjucks is not a sandbox: template expressions can reach the JavaScript `Function` constructor and run Node.js code **in the extension host**.
  * `local-obi-dir` in the (committed) project config points to a Python program that is executed locally ([OBICommands.ts:139-148](../../src/extension/obi/OBICommands.ts#L139-L148), [OBICommands.ts:401-408](../../src/extension/obi/OBICommands.ts#L401-L408)).
  * The OBI backend update runs `git pull` in `local-obi-dir` ([OBIController.ts:76-80](../../src/webview/controller/OBIController.ts#L76-L80)).
  * Build commands from `app-config.toml` are executed on the IBM i. That is the purpose of the extension, but it still means config from the repo is code.
* `package.json` declares no `capabilities`. The resulting behaviour in Restricted Mode is implicit.


# New feature

## Explicit trust declaration

`package.json`:

```json
"capabilities": {
  "untrustedWorkspaces": {
    "supported": false,
    "description": "OBI executes build commands and local programs defined in the project configuration."
  },
  "virtualWorkspaces": {
    "supported": false,
    "description": "OBI needs direct file system access to the project folder."
  }
}
```

`supported: false` keeps the extension disabled in Restricted Mode. That is the safe, simple choice. A later `"limited"` mode (e.g. read-only build history) can be added once the checks below exist.

## Defensive checks at the code-execution points

Even with `supported: false`, guard the three places explicitly, so that a later switch to `"limited"` can't open them by accident:

```ts
export function require_trust(action: string): boolean {
  if (vscode.workspace.isTrusted) return true;
  vscode.window.showWarningMessage(`${action} is disabled because this workspace is not trusted.`, 'Manage Workspace Trust')
    .then(choice => choice && vscode.commands.executeCommand('workbench.trust.manage'));
  return false;
}
```

* Build summary: include the custom template only if `isTrusted` (otherwise render without it).
* Local OBI calls (`show_changes`, `generate_build_script`, `add_sources_via_local_obi`): `require_trust('Running the local OBI')`.
* `git pull` for the OBI backend: `require_trust('Updating the OBI backend')`.

## Documentation

* [building.md](../../asserts/docs/building.md): the custom build list template is executable code (Nunjucks + scripts, subject to the CSP from [webview-csp.md](webview-csp.md)); only use templates you trust.
* [getting-started.md](../../asserts/docs/getting-started.md): OBI requires a trusted workspace.


# Tests

* Manual: open the test project in Restricted Mode → OBI views not shown; trust the workspace → views appear (VS Code activates the extension).
* Unit test: `require_trust` returns `false` and shows the warning when `isTrusted` is stubbed to `false`.


### Definition of done
* `capabilities.untrustedWorkspaces` and `capabilities.virtualWorkspaces` declared
* Custom template, local OBI execution and backend update are guarded by `isTrusted`
* Docs updated; CHANGELOG entry
