# Remote home directory is assumed to be `/home/<user>`

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟡 | finished (integration tests with stubbed SSH; not yet run against an IBM i) | [reliability.md R16](../improvements/reliability.md#r16--remote-home-directory-is-assumed-to-be-homeuser) | – |

Required by: [remote-command-quoting.md](remote-command-quoting.md) (paths are resolved locally) and [remote-delete-guard.md](remote-delete-guard.md) (home must not be deleted).


# Current situation

* `SSH_Tasks.get_finalized_remote_path` ([SSH_Tasks.ts:48-54](../../src/extension/utilities/SSH_Tasks.ts#L48-L54)) replaces **every** `~` with `/home/<user>` (also inside names such as `my~proj`), replaces only the first `${workspaceFolderBasename}`, and assumes the home directory is `/home/<user>`.
* On IBM i the home directory is the `HOMEDIR` of the user profile. It is often `/home/<USER>`, but it can differ (upper case, other base path).
* The setup checks hard-code `/home/$USER` ([OBITools.ts:215-283](../../src/extension/utilities/OBITools.ts#L215-L283)):
  * `check_remote_paths(['/home/$USER/.bashrc'])` and `mkdir -p /home/$USER/.ssh …`;
  * the message "Missing /home/$USER.bashrc" lacks a `/`;
  * `echo … > /home/$USER/.bashrc` would overwrite an existing file (it only runs when the check says the file is missing, so it's harmless today, but fragile).
* `AppConfig.replace_env_variables` has the inverted check described in [bugs.md #19](../bugs.md#19--inverted-check-in-replace_env_variables).


# Fix

## 1. Resolve the real home once per connection

```ts
private static remote_home: string | undefined;

public static async get_remote_home(): Promise<string> {
  if (SSH_Tasks.remote_home) return SSH_Tasks.remote_home;
  await SSH_Tasks.connect();
  const result = await SSH_Tasks.ssh.execCommand('printf %s "$HOME"');
  const home = result.code === 0 ? result.stdout.trim() : '';
  SSH_Tasks.remote_home = home.startsWith('/') ? home : `/home/${await SSH_Tasks.get_ssh_user()}`;
  return SSH_Tasks.remote_home;
}
```

Reset `remote_home` whenever a new connection is established (host or user changed).

## 2. Path expansion

```ts
public static async get_finalized_remote_path(p: string): Promise<string> {
  const user = await SSH_Tasks.get_ssh_user();
  const home = await SSH_Tasks.get_remote_home();
  return p.replace(/^~(?=\/|$)/, home)
          .replace(/\$USER\b/g, user)
          .replaceAll('${workspaceFolderBasename}', path.basename(Workspace.get_workspace()));
}
```

## 3. Setup checks use `$HOME`

* Home check: `test -d "$HOME"`. If missing: offer to create it with `mkdir -p "$HOME" && chmod 755 "$HOME"`.
* `.bashrc` check: `test -f "$HOME/.bashrc"`. If missing: append (`>>`) the PATH line. Message: "Missing `<home>/.bashrc`. Create it with the open-source package path?".
* `.ssh`: `mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"`.

These commands contain only constant text, so no user values are interpolated.

## 4. bugs.md #19

Fix the inverted check in `AppConfig.replace_env_variables` in the same change, or route that function through `get_finalized_remote_path`.


# Tests

Unit tests with a stubbed `execCommand`:
* `$HOME=/home/MAX` → `~/proj` → `/home/MAX/proj`; `my~proj` unchanged; `${workspaceFolderBasename}/x/${workspaceFolderBasename}` → both replaced.
* `$HOME` empty → fallback `/home/<user>`.


### Definition of done
* Remote home is resolved from `$HOME` and cached per connection
* Only a leading `~` is expanded; all placeholders are replaced
* Setup checks and messages use the real home directory
* bugs.md #19 fixed and removed
* Unit tests pass; CHANGELOG entry
