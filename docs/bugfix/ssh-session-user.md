# SSH: typed host and user are asked for again on every call

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟠 | finished (integration tests in SshSession.test.ts; 3 of 4 fail on the old code) | [improvements v2.2.3 R3](../improvements/v2.2.3/README.md) | – |


# Current situation

`SSH_Tasks` kept `host` and `ssh_user` in static fields, but:

* `connect()` set both from the config at the start of every new connection. A value typed into the prompt (because `remote-host` or `ssh-user` isn't in the config) was overwritten with `undefined` and asked for again.
* `is_connection_valid()` compared the open connection with `config.connection['ssh-user']` / `['remote-host']`. Without them in the config, the comparison always failed, so **every** SSH call (each transfer, command and download) opened a new connection and asked for host and user again.
* `get_ssh_user()` returned the field without looking at the config. Before the first connection (e.g. `BackendUpdate.update_remote`, or a remote path with `$USER`) it asked for the user even with `ssh-user` in the config.
* `reset_connection_state()` / `disconnect()` only cleared `remote_home`.
* `connect(callback?)` would have run the callback twice on a new connection (inside the connection promise and after it). No caller passed one.


# Fix

In [SSH_Tasks.ts](../../src/extension/utilities/SSH_Tasks.ts):

* `prompted`: host and user typed in, with the profile they were typed for. `prompted_values()` drops them as soon as another profile is active, also when the profile was changed by editing `workspace-settings.json`.
* `target()`: host and user of the next connection, the config of the active profile first, then `prompted`. `get_ssh_user()`, `connect()` and `is_connection_valid()` use it.
* A failed or cancelled connection forgets the typed values, so a wrong host or user can be corrected at the next attempt.
* `disconnect()` (deactivate) also clears `connected` and `prompted`.
* `connect()` has no callback parameter any more.


# Tests

Integration ([SshSession.test.ts](../../src/test/suite/SshSession.test.ts)), with a fake connection that stays open:

* With `ssh-user` in the config, `get_ssh_user()` doesn't ask, also before the first connection.
* Typed host and user: asked once; the open connection is used again; a lost connection is opened again with the same host and user, only the (unsaved) password is asked again.
* A failed connection asks for host and user again.
* Typed values belong to the profile; after a switch the host of the new profile is used, and a value in the config wins over a typed one.


# Definition of done

* [x] Fix and tests
* [x] [ssh.md](../../asserts/docs/ssh.md), CHANGELOG
* [x] Entry R3 removed from the improvement list
