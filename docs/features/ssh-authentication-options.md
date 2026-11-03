# SSH authentication options

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (Unreleased) | [usability.md U6](../improvements/usability.md#u6--ssh-authentication-options-are-limited) | [bugfix/ssh-keepalive-interval.md](../bugfix/ssh-keepalive-interval.md) (`build_connect_config`), [ssh-host-key-verification.md](ssh-host-key-verification.md) |

Also fixes [bugs.md #23](../bugs.md#23--ssh-key-placeholder-uses--which-is-not-supported).


# Current situation

`SSH_Tasks.connect()` ([SSH_Tasks.ts:83-135](../../src/extension/utilities/SSH_Tasks.ts#L83-L135)):
* uses `password` from `SecretStorage` (key `obi|<profile>|<host>|<user>`) or prompts for it. A prompted password is **not** offered for saving, so users without a saved password are asked again after every restart;
* uses `privateKeyPath` from `ssh-key`. Encrypted keys fail, because no passphrase is supported. `~` isn't expanded (bugs.md #23);
* doesn't use `ssh-agent` / Pageant;
* always connects to port 22;
* asks for the user if `ssh-user` is empty, but doesn't remember the answer.


# New feature

## 1. New connection settings (user config, `[connection]`)

| Key | Type | Default | Meaning |
|---|---|---|---|
| `ssh-port` | number | `22` | SSH port |
| `ssh-agent` | boolean | `false` | use the running agent (`SSH_AUTH_SOCK`, on Windows Pageant) |
| `ssh-key` | string | – | private key path; `~` and `%USERPROFILE%` / `$HOME` expanded locally |

* Add them to `ConfigConnection` ([AppConfig.ts:66-87](../../src/extension/config/AppConfig.ts#L66-L87)), the user tab of [config_details.html](../../asserts/templates/controller/config_details.html), [configuration.md](../../asserts/docs/configuration.md#connection) and [ssh.md](../../asserts/docs/ssh.md).
* The Python OBI doesn't use `[connection]` (verify); otherwise check that unknown keys don't break it.

## 2. Authentication order

`build_connect_config` sets the options so that ssh2 tries, in this order:
1. **agent** (if `ssh-agent = true` and an agent is available: `agent: process.env.SSH_AUTH_SOCK`, on Windows `agent: 'pageant'`);
2. **private key** (if `ssh-key` is set). If ssh2 reports an encrypted key without passphrase: prompt for the passphrase (`password: true` input box), retry, and on success offer to save it in `SecretStorage` (`obi|<profile>|<host>|<user>|passphrase`);
3. **password**: stored, or prompted. After a successful login with a prompted password, ask:
   > Save the password for profile **prod** in the OS keychain?

   `Save` / `Not now` / `Never for this profile` (stored in `workspaceState`).

## 3. Prompts

* Host prompt: offer to write the entered host into the user config (`Save to profile`).
* User prompt: same for `ssh-user`.
* All prompts use `ignoreFocusOut: true`, and cancelling throws `UserCancelledError` ([input-cancel-shows-error.md](../bugfix/input-cancel-shows-error.md)).

## 4. Errors

Map the common ssh2 errors to clear messages via `show_error` ([error-messages.md](error-messages.md)):

| ssh2 error | Message |
|---|---|
| `All configured authentication methods failed` | "Login to <user>@<host> failed. Check user, password or key." + `Open configuration` |
| `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND` | "Can't reach <host>:<port> (<code>)." |
| encrypted key without passphrase | handled by the passphrase prompt |


## Result

* The Python OBI doesn't read `[connection]` (checked); the new keys don't affect it.
* Pure helpers in [SshAuth.ts](../../src/extension/utilities/SshAuth.ts) (unit tests): path expansion, port, agent, order (`authHandler`: `none`, `agent`, `publickey`, `password`), error classification.
* The save questions (password, passphrase, host/user to profile) don't hold up the connection or the build: they appear as notifications after the login.
* Verified against a local OpenSSH server on port 22222: encrypted key without / with wrong / with right passphrase, agent login, refused port, wrong password; the ssh2 messages are classified as expected (the wrong passphrase message is "OpenSSH key integrity check failed -- bad passphrase?").
* Manual checks open: Pageant on Windows; a real IBM i with an encrypted key.


# Tests

* Unit tests for `build_connect_config`: port, agent (POSIX/Windows), expanded key path, no password when agent or key is used.
* Unit test: `~/.ssh/id_ed25519` → `<os.homedir()>/.ssh/id_ed25519`.
* Manual: login with an encrypted key (passphrase prompt + save), with ssh-agent, with a non-default port.


### Definition of done
* `ssh-port`, `ssh-agent` and expanded `ssh-key` work and are documented and editable in the config page
* Encrypted keys supported via passphrase prompt (saved in `SecretStorage` on request)
* Prompted passwords can be saved; host/user can be written to the profile
* Clear messages for the common login errors
* bugs.md #23 removed; CHANGELOG entry
