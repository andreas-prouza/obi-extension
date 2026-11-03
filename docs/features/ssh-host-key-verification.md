# SSH host key verification

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🔴 | finished (incl. `known_hosts`; tested with stubbed handshake, not yet against an IBM i) | [security.md S1](../improvements/security.md#s1--ssh-host-key-is-never-verified) | [bugfix/ssh-keepalive-interval.md](../bugfix/ssh-keepalive-interval.md) (`build_connect_config`) |


# Current situation

`SSH_Tasks.connect()` ([SSH_Tasks.ts:109-115](../../src/extension/utilities/SSH_Tasks.ts#L109-L115)) passes no `hostVerifier` / `hostHash` to node-ssh / ssh2. Without them, ssh2 accepts **any** host key. A man-in-the-middle (DNS spoofing, rogue Wi-Fi, ARP spoofing in the office network) can pose as the IBM i and receive the password, because password authentication is the default flow.


# New feature

## Trust on first use, with a stored fingerprint

### Behaviour
1. **First connection to a host** (no stored fingerprint): show a modal dialog
   > The authenticity of host **my-ibmi (port 22)** can't be established.
   > ED25519 key fingerprint: `SHA256:Ab3…`
   > Do you trust this host?

   Buttons: `Trust and connect` / (Cancel). On *Trust*, store the fingerprint and connect. On cancel, abort with `UserCancelledError` ([bugfix/input-cancel-shows-error.md](../bugfix/input-cancel-shows-error.md)).
2. **Known host, same fingerprint:** connect silently.
3. **Known host, different fingerprint:** refuse the connection and show a modal error
   > **Host key of my-ibmi has changed!** Someone could be intercepting the connection, or the host key was replaced.
   > Stored: `SHA256:…` — received: `SHA256:…`

   Only button: `Close`. Replacing the key requires the explicit command below.
4. Optional: if `~/.ssh/known_hosts` contains a matching key for the host (plain or hashed `|1|…` entries), treat it as trusted without asking. A mismatch with `known_hosts` is handled like (3).

### Storage
* `context.globalState`, key `obi|hostkey|<host>:<port>`, value `{ algorithm: string, fingerprint: string, first_seen: string }`.
* Global, not per workspace: the same IBM i is used from many projects.

### New command
* `obi.ssh.forget-host-key` — title "OBI: Forget stored SSH host key". Shows a quick pick of stored hosts and removes the selected entry after confirmation. Add it to `package.json` (`contributes.commands`) and the `package.nls*.json` files ([CLAUDE.md](../../CLAUDE.md) rule).


## Implementation

* New file `src/extension/utilities/HostKeyStore.ts`:
  ```ts
  export type HostKeyDecision = 'trusted' | 'unknown' | 'mismatch';

  export function fingerprint(key: Buffer): string {            // OpenSSH format
    return 'SHA256:' + crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
  }

  export function decide(stored: string | undefined, presented: string): HostKeyDecision {
    if (!stored) return 'unknown';
    return stored === presented ? 'trusted' : 'mismatch';
  }
  ```
  plus `get/set/delete` on `globalState`, and an optional `known_hosts` lookup.
* `SSH_Tasks.build_connect_config(...)` adds:
  ```ts
  hostVerifier: (key: Buffer, verify: (valid: boolean) => void) => {
    HostKeyStore.verify_interactively(host, port, key).then(verify, () => verify(false));
  }
  ```
  ssh2 (≥ 1.x) supports the asynchronous `(key, verify)` form. Check the exact typing in `@types/ssh2` / node-ssh's `Config` and add a local type if necessary (no `any`).
* The host key algorithm name for the dialog can be read from the key blob (first length-prefixed string, e.g. `ssh-ed25519`).
* Connection error messages must make a host-key refusal distinguishable from a network error ("Connection refused: host key mismatch").


# Tests

* Unit tests: `fingerprint()` of a known test key matches the value printed by `ssh-keygen -lf`; `decide()` for all three cases.
* Unit test for the `known_hosts` parser: plain entry, hashed entry (`|1|salt|hash`), entry with port `[host]:2222`, comment lines.
* Manual: connect to a test IBM i (first-use dialog), connect again (silent), change the stored value in `globalState` (mismatch dialog, no connection), run *Forget stored SSH host key* (first-use dialog again).


### Definition of done
* Every SSH connection verifies the host key; unknown keys require explicit trust; changed keys block the connection
* Fingerprints are stored in `globalState` per host and port
* `obi.ssh.forget-host-key` exists, is in `package.json` and localized
* Optional `known_hosts` support (can be a follow-up)
* [ssh.md](../../asserts/docs/ssh.md) explains the dialog and how to verify the fingerprint on the IBM i (`ssh-keygen -lf <host key>.pub` for the sshd host key; the directory depends on the installed OpenSSH package, e.g. `/QOpenSys/etc/ssh/`)
* Unit tests pass; CHANGELOG entry
