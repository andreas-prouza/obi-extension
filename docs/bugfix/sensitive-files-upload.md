# Sensitive files are uploaded to the IBM i

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟠 | finished (open questions on ESP configs and secrets via environment remain) | [security.md S9](../improvements/security.md#s9--sensitive-files-are-uploaded-to-the-ibm-i-with-default-permissions) | – |

Related: [bugs.md #1](../bugs.md#1--secret-variables-are-stored-in-plain-text-in-the-build-history) (secrets in the local history snapshot).

[open-tasks.md](../open-tasks.md) plans to remove "Transfer all" (the whole-workspace upload). The remaining minimum transfer ([OBITools.ts:1049-1062](../../src/extension/utilities/OBITools.ts#L1049-L1062)) still uploads the complete `.obi/etc` folder, with every profile's user config and `workspace-settings.json`, so the exclude list and the file mode are still needed.


# Current situation

* "Transfer all" (`SSH_Tasks.ssh_put_dir`, [SSH_Tasks.ts:428-462](../../src/extension/utilities/SSH_Tasks.ts#L428-L462)) uploads the workspace and only skips files **named** `.git`, `.vscode`, `.theia`, `.project`, `.gitignore` and `*.pyc`. Uploaded as well:
  * `.obi/build-history/**` (compile-list snapshots with the merged config, see bugs.md #1)
  * `.obi/log/**` (extension logs with commands and remote output)
  * `.obi/tmp/**`
  * `.obi/etc/.user-app-config*.toml` of **every** profile, and `.obi/etc/workspace-settings.json`
* `getRemoteDir` uses its own, slightly different exclude list ([SSH_Tasks.ts:189-196](../../src/extension/utilities/SSH_Tasks.ts#L189-L196)).
* Every build uploads the current profile's user config as `.obi/etc/.user-app-config.toml` ([SSH_Tasks.ts:320-337](../../src/extension/utilities/SSH_Tasks.ts#L320-L337)). It may contain `secret*` variables in plain text. No file mode is set, so the IFS default (often world-readable) applies.


# Fix

## 1. One exclude list, matched on relative paths

New constant in [Constants.ts](../../src/shared/Constants.ts):

```ts
/** Paths (relative to the workspace, '/'-separated) never uploaded by "Transfer all". */
public static readonly TRANSFER_EXCLUDES: string[] = [
  '.git', '.vscode', '.theia', '.project', '.gitignore',
  '.obi/build-history', '.obi/log', '.obi/tmp',
  '.obi/etc/workspace-settings.json',
  '.obi/etc/.user-app-config*.toml',   // the active profile is uploaded separately, see step 2
];
```

New helper `is_transfer_excluded(local_root: string, item_path: string): boolean`:
* computes `path.relative(local_root, item_path)` and normalises it to `/`;
* matches it against the list with `minimatch` (`{ dot: true }`), so that both the entry and everything below it match;
* keeps the `*.pyc` rule.

Use the helper in `ssh_put_dir` and in `getRemoteDir`. For downloads, only `.git`-like entries are relevant, so pass a separate, smaller list there.

## 2. Upload the user config with restrictive permissions

In `transferSources` and `transfer_files`, upload the user config with mode `0o600`. node-ssh passes `transferOptions` to ssh2 `fastPut`, which supports `mode`:

```ts
await SSH_Tasks.ssh.putFile(local_user_config, remote_user_config, undefined, { mode: 0o600 });
```

As a fallback (in case the IFS ignores the SFTP mode), run `chmod 600 -- '<remote user config>'` once per connection.

## 3. Clean up existing uploads

Previously uploaded files stay on the IBM i until the next "Transfer all" (which replaces the folder). Add a note to the CHANGELOG recommending one "Transfer all" after updating, or remove `.obi/build-history` on the remote once during the first build after the update (`rm -rf -- '<base>/.obi/build-history'`, using [remote-command-quoting.md](remote-command-quoting.md)).


# Open questions

* Does the Python OBI read `.obi/etc/.user-extended-source-processing-config*.toml` on the IBM i? If yes, upload the active profile's file in `transferSources` (like the user app config) instead of relying on "Transfer all".
* Passing `secret*` variables via environment instead of a file needs a change in the Python OBI. Track it there and don't block this fix on it.


# Tests

* Unit tests for `is_transfer_excluded`: excluded `.obi/build-history/2026…/compile-list.json`, `.obi/log/combined.log`, `.obi/etc/.user-app-config-prod.toml`, `.git/HEAD`; included `.obi/etc/app-config.toml`, `.obi/etc/constants.py`, `src/lib/qrpglesrc/a.rpgle.pgm`, `.obi/build-output/compile-list.json`.
* Windows paths: `C:\ws\.obi\log\x.log` relative to `C:\ws` is excluded.


### Definition of done
* One exclude list, matched on workspace-relative paths, used for all directory uploads
* Build history, logs, tmp, workspace settings and non-active profiles are no longer uploaded
* User config is uploaded with mode `600` (verified on an IBM i with `ls -l`)
* Unit tests pass on Linux and Windows
* CHANGELOG entry including the clean-up note
