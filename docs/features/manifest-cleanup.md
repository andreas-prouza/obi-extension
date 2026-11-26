# Manifest and dead code cleanup

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Refactoring | 🟡 | finished (check-repo rule tested with a violation; registration test without exceptions) | [improvements v2.2.3 D4](../improvements/v2.2.3/README.md), [bugs.md #9](../bugs.md#9--contributed-commands-that-are-not-registered), [bugs.md #10](../bugs.md#10--when-on-contributescommands-has-no-effect) | – |


# Current situation

* 54 of 82 entries of `contributes.commands` had a `when`. VS Code ignores it there, so these commands were in the Command Palette in every workspace, also hidden ones (`... && false`). 25 of them also had an entry in `menus.commandPalette`.
* `obi.showErrors`, `obi.show.tools` and `obi.get-remote-compiled-object-list` were contributed but never registered: "command not found". The registration test listed them as known exceptions.
* The *Quick settings* view was hidden (`"when": "false && …"`), but `QuickSettings` was created and registered at every activation.
* The legacy cleanup of the config tab state in the keychain (`context.secrets.delete`) ran at every activation, without handling a rejection.
* `extension.ts` imported `OPEN_CONFIGURATION` without using it.


# Change

* `package.json`: the `when` of all commands moved to `menus.commandPalette` (27 new entries with the same condition; for the 25 with an entry the entry's condition stays, so the two hidden ones stay hidden). 79 commands.
* The three unregistered commands are removed from `package.json` and both NLS files, and no menu names them.
* `QuickSettings.ts`, its template, the view and its NLS text are removed.
* The keychain cleanup runs once per installation (`globalState` `obi.legacy-ui-secrets-removed`), errors are logged.
* Unused import removed. Lint warnings 224 → 221.
* `check:repo` (`check_command_contributions`): no `when` on `contributes.commands`.


# Tests

* [extension.test.ts](../../src/test/suite/extension.test.ts): every contributed command is registered, without exceptions; every command named in a menu or the Command Palette is contributed.
* `check_command_contributions`: run with a `when` on a command; it is reported.


# Definition of done

* [x] Change, rule and tests
* [x] CHANGELOG, bugs.md #9 and #10
* [x] Entry D4 removed from the improvement list
