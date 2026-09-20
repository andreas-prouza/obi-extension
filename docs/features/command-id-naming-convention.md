# Current situation

[CLAUDE.md](../../CLAUDE.md) states "Command IDs use the prefix `obi-`".

Every command actually registered in `package.json` uses `obi.` (dot) instead,
e.g. `obi.show_changes`, `obi.source-filter.add`, `obi.run_build`.
The documented convention does not match any command in the codebase.

# New feature

## Align documented and actual command ID convention

### Definition of done
* Decide the real convention: keep `obi.` (dot, namespaced, matches VS Code convention) or migrate to `obi-`
* If keeping `obi.`: update `CLAUDE.md` to say `obi.` instead of `obi-`
* If migrating to `obi-`: rename all command IDs in `package.json`, `package.nls*.json`, and all
  `vscode.commands.registerCommand(...)` / `executeCommand(...)` call sites, and update the `when` clauses
* Either way, add a short note to `CLAUDE.md` giving one concrete example command ID
