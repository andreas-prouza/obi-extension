# Test connection

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (unit tests incl. the script in bash; integration tests with stubbed SSH; not yet tried against an IBM i) | [improvements v2.2.3 F1](../improvements/v2.2.3/README.md) | [ssh-session-user.md](../bugfix/ssh-session-user.md) |


# Current situation

A wrong host, key, home directory or OBI setup on the IBM i only showed up when a build ran, often as a message of one of its steps. The checks before a build (`check_remote_pase`, `check_remote_basics`) ask and offer to create files, so they can't be used for a plain check.


# New feature

* **Configuration page:** a button *Test connection* in the connection settings of both tabs (it always uses the saved configuration of the active profile). The results are shown below the button: ✓ OK, ⚠ note, ✗ problem.
* **Command** `obi.test-connection` (*OBI: Test connection*, Command Palette in an OBI project, also with an incomplete configuration): the same test with a progress notification, results in a modal dialog.
* [ConnectionTest.ts](../../src/extension/utilities/ConnectionTest.ts) `test_connection()`:
  1. `SSH_Tasks.connect()`, as before a build: asks for a missing host, user, password and an unknown host key. A failed login is one ✗ result with its message, a cancelled prompt ends the test without results.
  2. One read-only script ([ConnectionCheck.ts](../../src/shared/ConnectionCheck.ts), `SSH_Tasks.run_command`) prints `key=value` lines: `$HOME` and whether it exists, `.bashrc`, `$PATH`, whether `remote-base-dir` exists, whether `<remote-obi-dir>/venv/bin/python` is executable and its `--version`, and `OBI_BACKEND_VERSION` read with `sed` from `module/obi_constants.py` (the backend itself is not run). Paths are resolved (`~`, `$USER`) and quoted with `sh_quote`.
  3. Rules: home directory missing ✗; no `.bashrc` or `/QOpenSys/pkgs/bin` not in the `PATH` ⚠; project folder missing ⚠ (created by the first transfer); venv Python missing or older than 3.12 ✗; backend version older than `Constants.OBI_BACKEND_VERSION` ✗ (with the hint `git pull` / `obi.backend.autoUpdateRemote`), unknown ⚠.
* The page shows the texts with `textContent` (they contain paths from the IBM i).

Not part of it: `~/.ssh/config` aliases and `ProxyJump` (the second half of the improvement item).


# Tests

* Unit ([ConnectionCheck.test.ts](../../src/test/unit/ConnectionCheck.test.ts)): parsing, Python version rule, `PATH`; the script runs in a local bash against a fake OBI folder with a blank in its name and changes nothing (skipped on Windows).
* Integration ([ConnectionTest.test.ts](../../src/test/suite/ConnectionTest.test.ts)), `SSH_Tasks` stubbed: all OK; notes; missing backend, old backend, old Python; failed login and cancelled prompt; the button on both tabs and the message in `CONFIGURATION_REQUESTS`.


# Definition of done

* [x] Feature and tests
* [x] [ssh.md → Test connection](../../asserts/docs/ssh.md#test-connection), configuration.md, CHANGELOG
* [x] Entry F1 changed in the improvement list (the `~/.ssh/config` part stays)
