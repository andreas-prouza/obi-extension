# Unresolved command parameters

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟡 | finished (Python OBI not yet aligned) | [maintainability.md M8](../improvements/maintainability.md#m8--hard-coded-list-of-removable-command-parameters) | [self-referencing-variable.md](self-referencing-variable.md) |


# Current situation

`removeUnresolvedCmdParameters` ([build_cmds.ts:132-151](../../src/extension/obi/compile_list/modules/build_cmds.ts#L132-L151)) removes unresolved placeholders with 16 hard-coded replacements:

* `ACTGRP($(ACTGRP))`, `BNDDIR($(INCLUDE_BNDDIR))`, `TGTRLS($(TGTRLS))`, `STGMDL($(STGMDL))`, `TGTCCSID($(TGTCCSID))`, `DBGVIEW($(DBGVIEW))`, `INCDIR($(INCDIR_SQLRPGLE))`, `INCDIR($(INCDIR_RPGLE))` and the empty forms `KEYWORD()`;
* `INCDIR()` is listed twice;
* matching is case-sensitive (`actgrp($(ACTGRP))` stays);
* the removal leaves double spaces;
* any other unresolved placeholder (e.g. a typo `$(TARGET_LIBB)`) stays in the command silently and only fails on the IBM i.

Removing **every** unresolved `KEYWORD($(VAR))` generically is not an option: mandatory parameters such as `PGM($(OBJ_NAME))` or `SRCSTMF('$(SOURCE_FILE_NAME)')` would be dropped and the command would change its meaning.


# Fix

## 1. Data-driven list of optional parameters

```ts
/** CL keywords that may be omitted when their variable is not set. Keep in sync with the Python OBI. */
export const OPTIONAL_CMD_KEYWORDS: Record<string, string[]> = {
  ACTGRP:   ['ACTGRP'],
  BNDDIR:   ['INCLUDE_BNDDIR'],
  TGTRLS:   ['TGTRLS'],
  STGMDL:   ['STGMDL'],
  TGTCCSID: ['TGTCCSID'],
  DBGVIEW:  ['DBGVIEW'],
  INCDIR:   ['INCDIR_RPGLE', 'INCDIR_SQLRPGLE'],
};

export function removeUnresolvedCmdParameters(cmd: string): string {
  for (const [keyword, vars] of Object.entries(OPTIONAL_CMD_KEYWORDS)) {
    const var_alt = vars.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const re = new RegExp(`\\s*\\b${keyword}\\(\\s*(?:\\$\\((?:${var_alt})\\))?\\s*\\)`, 'gi');
    cmd = cmd.replace(re, '');
  }
  return cmd;
}
```

Same behaviour as today for the existing cases, plus: case-insensitive keyword, no duplicate entry, surrounding whitespace removed. Build the regexes once at module load, not per call.

## 2. Warn about remaining placeholders

```ts
export function find_unresolved_placeholders(cmd: string): string[] {
  return [...cmd.matchAll(/\$\(([A-Za-z0-9_.\-]+)\)/g)].map(m => m[1]);
}
```

* In `getSourceBuildCmds`, collect unresolved names per source (excluding names that are intentionally shell syntax, e.g. lowercase `$(pwd)`: only report names matching `^[A-Z][A-Z0-9_]*$`).
* After *Show changes*, if any were found, log them per source and show one warning: "3 commands contain unresolved variables (e.g. TARGET_LIBB in lib/qrpglesrc/a.rpgle.pgm)." with *Show log*.
* No change to the `compile-list.json` format.

## 3. Python OBI parity

The Python OBI has its own version of this function. Apply the same list there, or note the difference in [features/json-schemas.md](../features/json-schemas.md) (shared fixtures).


# Tests

* All 16 current replacements produce the same output as before (table test).
* `actgrp($(ACTGRP))` is removed; `PGM($(OBJ_NAME))` with unresolved `OBJ_NAME` is **not** removed and is reported.
* `CRTBNDRPG PGM(X) DBGVIEW() TGTRLS(*CURRENT)` → `CRTBNDRPG PGM(X) TGTRLS(*CURRENT)` (the whitespace before the removed keyword goes with it).
* `find_unresolved_placeholders("cd $(pwd) && X($(TARGET_LIBB))")` → reported: `TARGET_LIBB` only.


### Definition of done
* Optional keywords are defined in one table; matching is case-insensitive; no duplicates
* Remaining unresolved uppercase placeholders are reported to the user after *Show changes*
* Existing behaviour unchanged for the current keywords (tests)
* Python OBI informed or aligned
* CHANGELOG entry
