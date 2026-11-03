# Security improvements

Findings from a code review of v1.3.3 (2026-10-22). Per [architecture.md](../architecture.md), security comes before features.

Severity: 🔴 high · 🟠 medium · 🟡 low. See [README.md](README.md) for how this list is maintained.

Already tracked elsewhere and not repeated here:
* Local shell command injection → [features/command-injection-hardening.md](../features/command-injection-hardening.md)
* `secret*` variables in the build history snapshot → [bugs.md #1](../bugs.md#1--secret-variables-are-stored-in-plain-text-in-the-build-history)
* Destructive actions without confirmation → [bugs.md #2–#5](../bugs.md#security--data-loss)
* `"latest"` dependency versions → [features/pin-dependency-versions.md](../features/pin-dependency-versions.md)


## S1. 🔴 SSH host key is never verified
* **Where:** [SSH_Tasks.ts:109-115](../../src/extension/utilities/SSH_Tasks.ts#L109-L115)
* **Current:** `ssh.connect()` gets no `hostVerifier` / `hostHash`. Without them, ssh2 accepts any host key, so a man-in-the-middle can pose as the IBM i and capture the password (password auth is the default flow).
* **Proposal:**
  * Trust on first use: on the first connect, show the SHA256 fingerprint in a modal and store it per host (e.g. `globalState`, key `obi|hostkey|<host>`).
  * On a fingerprint mismatch, refuse to connect and show a clear warning (no "connect anyway" by default).
  * Optionally read `~/.ssh/known_hosts` so keys already trusted by OpenSSH are accepted.


## S2. 🔴 Remote shell commands lose their quoting
* **Where:** [SSH_Tasks.ts:41-45](../../src/extension/utilities/SSH_Tasks.ts#L41-L45), call sites [OBICommands.ts:163-167](../../src/extension/obi/OBICommands.ts#L163-L167), [OBICommands.ts:200](../../src/extension/obi/OBICommands.ts#L200), [OBICommands.ts:518](../../src/extension/obi/OBICommands.ts#L518)
* **Current:** `get_finalized_command` wraps the command in `bash -c '...'` and replaces `'` with `''`. In POSIX shells, `''` closes and reopens the quote, so it does not escape it. Every inner single quote disappears. Reproduced locally:
  ```
  bash -c 'cd ''/tmp/my dir'' || exit 1; echo inner-ok'
  bash: line 1: cd: too many arguments
  ```
  As a result, `cd '${remote_base_dir}'` and `--source='${source}'` reach the remote bash **unquoted**. Spaces break the command, and `;`, `$()` or backticks in a path or source name are executed on the IBM i.
  On top of that, the quote character for `--source=` is chosen by the **local** platform (`"` on Windows), but the command runs in the remote bash. With `"`, `$()` is expanded remotely.
* **Proposal:**
  * Add one helper `sh_quote(s) = "'" + s.replace(/'/g, "'\\''") + "'"` and use it for every interpolated value in remote commands (paths, source names, `${workspaceFolderBasename}`).
  * Never pick the remote quote character from `process.platform`.
  * Validate source names against an allow-list of characters valid in IBM i paths before building commands.
  * Add a regression test (pairs with [command-injection-hardening.md](../features/command-injection-hardening.md), which only covers the local side).


## S3. 🔴 Unquoted, weakly guarded `rm -rf` on the IBM i
* **Where:** [SSH_Tasks.ts:269-303](../../src/extension/utilities/SSH_Tasks.ts#L269-L303), [SSH_Tasks.ts:243-264](../../src/extension/utilities/SSH_Tasks.ts#L243-L264), [OBITools.ts:60-70](../../src/extension/utilities/OBITools.ts#L60-L70)
* **Current:**
  * "Transfer all" runs `rm -rf ${remote_base_dir}` without quotes. The only guard is `remote-base-dir.length < 4`, plus a `pwd` length check that tests the current directory rather than the target.
  * `get_finalized_remote_path` turns `~` into `/home/<user>`, so `remote-base-dir = "~"` passes the guard and deletes the user's home directory, including `.ssh`.
  * `self_check` rejects only the exact value `/`.
  * `delete_sources` runs `rm ${file_path}` unquoted for each file, in parallel, and ignores exit codes.
* **Proposal:**
  * Resolve the target to an absolute path on the remote (`realpath`) and refuse a deny-list: `/`, `/home`, `$HOME`, `/QSYS.LIB`, `/QOpenSys`, `/QIBM`, `/tmp`, and anything less than 2 levels deep.
  * Only delete if the folder contains an OBI marker (e.g. `.obi/etc/app-config.toml`). Otherwise ask explicitly.
  * Use `rm -rf -- "$dir"` with S2 quoting, and show the resolved absolute path in the confirmation dialog (see [bugs.md #4](../bugs.md#4--transfer-all-deletes-the-remote-project-folder)).
  * Better long-term: sync (upload changed, delete orphaned) instead of delete-then-upload.


## S4. 🔴 Stored secrets are sent back into webview HTML
* **Where:** [OBIConfiguration.ts:109](../../src/webview/controller/OBIConfiguration.ts#L109), [OBIConfiguration.ts:126](../../src/webview/controller/OBIConfiguration.ts#L126), [config_details.html:56-57](../../asserts/templates/controller/config_details.html#L56-L57); same pattern for the i-Releaser token in [DeploymentConfig.ts:105-114](../../src/webview/deployment/DeploymentConfig.ts#L105-L114) and [deployment-config.html:29](../../asserts/templates/deployment/deployment-config.html#L29)
* **Current:** the SSH password is read from `SecretStorage` and rendered as `value="{{ SSH_PASSWORD }}"` into the config page. The secret then sits in the webview DOM, where it is visible in webview devtools and readable by any script running in the page (see S5/S6).
* **Proposal:** treat secret fields as write-only. Render only a state ("password stored ✓") with *Change* and *Remove* buttons, and never send the stored value to a webview.


## S5. 🔴 Stored XSS in the source description editor
* **Where:** [source-infos-config.html:66](../../asserts/templates/source_list/source-infos-config.html#L66), [source-infos-config.html:93-116](../../asserts/templates/source_list/source-infos-config.html#L93-L116)
* **Current:** the description from `source-infos.json` is placed in a JS string inside an inline `onfocusout="update_cell(..., '{{ row['description'] }}', ...)"` handler.
  Nunjucks escapes `'` to `&#39;`, but the browser decodes attribute entities **before** compiling the handler. A description like `x');alert(1);//` therefore runs as code.
  `update_cell` then rebuilds the cell HTML from `element.value` by string concatenation, which has the same problem with `"`.
  `source-infos.json` is usually committed and shared, so one team member's description runs in everyone's webview. The webview has `enableScripts` and `enableCommandUris`, and its message handlers write files and start builds.
  A harmless description like `Customer's orders` already breaks the field with a syntax error.
* **Proposal:**
  * No inline event handlers anywhere. Pass values via `data-*` attributes and attach listeners in the bundled script ([source_infos.ts](../../src/webview/source_list/javascript/source_infos.ts)).
  * Build DOM with `textContent` / `setAttribute`, never with HTML strings. The same applies to `innerHTML` in [controller.ts:176](../../src/webview/controller/javascript/controller.ts#L176).


## S6. 🟠 No Content-Security-Policy in any webview
* **Where:** all templates in [asserts/templates/](../../asserts/templates/); nonce from [getNonce.ts](../../src/extension/utilities/getNonce.ts)
* **Current:**
  * No template sets a `Content-Security-Policy` meta tag. The generated nonce therefore has no effect.
  * Inline `<script>` blocks exist in [configuration.html:120](../../asserts/templates/controller/configuration.html#L120), [source-infos-config.html:91](../../asserts/templates/source_list/source-infos-config.html#L91), [config_source_list.html:38](../../asserts/templates/controller/config_source_list.html#L38) and [maintain-source-dependency.html:146](../../asserts/templates/source_list/maintain-source-dependency.html#L146), plus an inline `onclick` in [show_changes/index.html:26](../../asserts/templates/show_changes/index.html#L26).
  * `getNonce` uses `Math.random()`.
* **Proposal:**
  * Add one CSP via a shared partial, e.g. `default-src 'none'; script-src 'nonce-…' ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:`.
  * Move inline scripts into the esbuild bundles.
  * Generate the nonce with `crypto.randomBytes(16).toString('base64')`.
  * Only set `enableCommandUris` where `command:` links are actually used.


## S7. 🟠 Webview messages are trusted without validation
* **Where:** [BuildSummary.ts:115-145](../../src/webview/show_changes/BuildSummary.ts#L115-L145), [OBIConfiguration.ts:417-479](../../src/webview/controller/OBIConfiguration.ts#L417-L479), [OBIController.ts:243-258](../../src/webview/controller/OBIController.ts#L243-L258)
* **Current:**
  * `file_content` reads **any** path sent by the webview and returns its content to the webview.
  * `open_file` joins `message.source` without a traversal check.
  * `save_config` deep-merges arbitrary objects into the TOML (no guard against `__proto__` / `constructor` keys).
  * `change_profile` accepts any string.
  Combined with S5/S6, a script in a webview can read any local file.
* **Proposal:**
  * Define a typed message schema per panel and reject unknown commands or fields.
  * Resolve paths and require `path.relative(workspace, p)` to not start with `..`.
  * Skip prototype keys when merging.
  * Validate profile names (see S12).


## S8. 🟠 Workspace-provided Nunjucks template runs in the extension host
* **Where:** [BuildSummary.ts:368-371](../../src/webview/show_changes/BuildSummary.ts#L368-L371), [BuildSummary.ts:402](../../src/webview/show_changes/BuildSummary.ts#L402), [BuildSummary.ts:517-521](../../src/webview/show_changes/BuildSummary.ts#L517-L521), [show_changes/index.html:28](../../asserts/templates/show_changes/index.html#L28)
* **Current:** `.obi/.vscode/templates/custom_build_list_template.html` from the workspace is included into the build summary. Nunjucks is not a sandbox: template expressions can reach the JavaScript `Function` constructor, so a template can run arbitrary Node.js code in the extension host. A cloned repository can ship such a file. `package.json` declares no `capabilities.untrustedWorkspaces`.
* **Proposal:**
  * Declare `"capabilities": { "untrustedWorkspaces": { "supported": "limited" } }` (or `false`) explicitly.
  * Check `vscode.workspace.isTrusted` before rendering the custom template, running local OBI (`main.py`), or running `git pull` ([OBIController.ts:78-80](../../src/webview/controller/OBIController.ts#L78-L80)).
  * Document that the custom template is executable code.


## S9. 🟠 Sensitive files are uploaded to the IBM i with default permissions
* **Where:** [SSH_Tasks.ts:436-447](../../src/extension/utilities/SSH_Tasks.ts#L436-L447), [SSH_Tasks.ts:320-337](../../src/extension/utilities/SSH_Tasks.ts#L320-L337)
* **Current:**
  * "Transfer all" uploads the whole workspace except `.git`, `.vscode`, `.theia`, `.project`, `.gitignore` and `*.pyc`. That includes `.obi/build-history` (config snapshots, see [bugs.md #1](../bugs.md#1--secret-variables-are-stored-in-plain-text-in-the-build-history)), `.obi/log`, every profile's `.user-app-config-*.toml` and `workspace-settings.json`.
  * Every build re-uploads the user config, which may contain `secret*` variables, in plain text to the shared IFS folder. No permissions are set on any of these files.
* **Proposal:**
  * Use an explicit exclude list (build-history, log, tmp, other profiles' user configs).
  * Run `chmod 600` (or `umask 077`) for user config files after upload.
  * Consider passing `secret*` variables to the remote OBI via environment over SSH instead of a file.


## S10. 🟠 Project template has no `.gitignore`
* **Where:** [obi-media/](../../obi-media/), [OBITools.ts:435-466](../../src/extension/utilities/OBITools.ts#L435-L466)
* **Current:** "Initialize" copies the template without a `.gitignore`. Personal and generated files end up in commits: `.obi/etc/.user-app-config*.toml` (user name, secret variables), `.obi/etc/workspace-settings.json`, `.obi/log/`, `.obi/tmp/`, `.obi/build-output/`, `.obi/build-history/`.
* **Proposal:** ship a `.gitignore` in `obi-media` and mention it in [getting-started.md](../../asserts/docs/getting-started.md). Decide whether `object-builds.json` is per-developer or shared before listing it.


## S11. 🟡 Log files are unbounded and verbose
* **Where:** [Logger.ts:36-58](../../src/extension/utilities/Logger.ts#L36-L58), [DirTool.ts:227](../../src/extension/utilities/DirTool.ts#L227), [SSH_Tasks.ts:151-157](../../src/extension/utilities/SSH_Tasks.ts#L151-L157)
* **Current:**
  * The log level is hard-coded to `debug`.
  * `combined.log` / `error.log` in `.obi/log` have no size limit or rotation.
  * Full remote commands and stdout, and on JSON parse errors the full file content, are logged.
  * The logs are also uploaded by "Transfer all" (S9).
* **Proposal:** add a configurable level (`info` by default), winston `maxsize` / `maxFiles`, and never log file contents. See also [replace-console-log-with-logger.md](../features/replace-console-log-with-logger.md).


## S12. 🟡 Profile names allow path traversal
* **Where:** [OBIController.ts:273-291](../../src/webview/controller/OBIController.ts#L273-L291), [AppConfig.ts:443-445](../../src/extension/config/AppConfig.ts#L443-L445), [EspConfig.ts:88-90](../../src/extension/config/EspConfig.ts#L88-L90)
* **Current:** the profile name becomes part of a file name without validation. `validateInput` normalises only the first space, and that normalised value isn't used afterwards. A name like `../../x` writes outside `.obi/etc`.
* **Proposal:** allow-list `^[A-Za-z0-9_-]+$` in the input box and wherever a profile name is read (`workspace-settings.json`, webview messages).


## S13. 🟡 i-Releaser auth token in the URL query
* **Where:** [I_Releaser.ts:108](../../src/webview/deployment/I_Releaser.ts#L108)
* **Current:** `fetch(`${url}/api/get_workflows?auth-token=${auth_token}`)`. Tokens in URLs end up in proxy and server logs. The feature is currently hidden (`when: 1==2`).
* **Proposal:** send the token in an `Authorization` header and refuse non-`https` URLs, before the feature is enabled.


## S14. 🟡 SecretStorage is used for UI state
* **Where:** [OBIConfiguration.ts:115-116](../../src/webview/controller/OBIConfiguration.ts#L115-L116), [OBIConfiguration.ts:178-181](../../src/webview/controller/OBIConfiguration.ts#L178-L181)
* **Current:** the selected config tab (`obi|config|panel`, `obi|config|panel_tab`) is written to the OS keychain on every webview message.
* **Proposal:** use `workspaceState` for UI state and keep the keychain for real secrets. This also avoids keychain round-trips (slow on Linux/libsecret).


## S15. 🟡 Vendored front-end libraries are outside dependency auditing
* **Where:** [asserts/js/](../../asserts/js/), [asserts/bootstrap/](../../asserts/bootstrap/), [package.json](../../package.json)
* **Current:**
  * jQuery 3.7.1, Choices 11.1.0, Tom Select 2.4.3, Bootstrap 5.3.3 and bootstrap-table 1.23.2 are copied into the repo. `npm audit` and Dependabot never see them.
  * `@vscode/webview-ui-toolkit` 1.4.0 is deprecated upstream.
  * `minimatch` is imported in production code ([app_config_tools.ts:2](../../src/extension/obi/compile_list/modules/app_config_tools.ts#L2)) but only present as a dev-only transitive dependency.
* **Proposal:**
  * Install front-end libs via npm and copy them in the build step, so they're audited.
  * Declare `minimatch` explicitly.
  * Add `npm audit --omit=dev` to CI (see [maintainability.md M3](maintainability.md#m3--no-continuous-integration)).
  * Any replacement package must be checked against the criteria in [architecture.md](../architecture.md#npm).
