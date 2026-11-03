# Self-referencing variable crashes build-list generation

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟠 | finished | [reliability.md R5](../improvements/reliability.md#r5--a-self-referencing-variable-crashes-build-list-generation) | – |

Implement together with [unresolved-cmd-parameters.md](unresolved-cmd-parameters.md) (same function).


# Current situation

[build_cmds.ts:117-130](../../src/extension/obi/compile_list/modules/build_cmds.ts#L117-L130):

```ts
export function replaceCmdParameters(cmd: string, variableDict: any): string {
  for (const k in variableDict) {
    ...
    const cmd_new = cmd.replace(new RegExp(`\\$\\(${k}\\)`, 'g'), String(v));
    if (cmd_new !== cmd) {
      cmd = replaceCmdParameters(cmd_new, variableDict);
    }
  }
  return removeUnresolvedCmdParameters(cmd);
}
```

* Recursion without a depth limit. `A = "x $(A)"` (or `A = "$(B)"`, `B = "$(A)"`) causes `RangeError: Maximum call stack size exceeded` during *Show changes*. The error message doesn't point to the variable.
* Each key is turned into a `RegExp` without escaping. Keys from `global.cmds` are prefixed (`global.cmds.add-lible`) and contain `.`, which matches any character.
* One `RegExp` is compiled per key and per recursion level (performance, see [features/build-list-config-caching.md](../features/build-list-config-caching.md)).
* `removeUnresolvedCmdParameters` is called at every recursion level.


# Fix

Replace the function with an iterative version that uses one regex for all placeholders:

```ts
const PLACEHOLDER = /\$\(([A-Za-z0-9_.\-]+)\)/g;
const MAX_SUBSTITUTION_PASSES = 20;

export function replaceCmdParameters(cmd: string, variableDict: Record<string, unknown>): string {
  const original = cmd;
  let replaced_in_last_pass: string[] = [];

  for (let pass = 0; pass < MAX_SUBSTITUTION_PASSES; pass++) {
    replaced_in_last_pass = [];
    cmd = cmd.replace(PLACEHOLDER, (match: string, key: string) => {
      const value = variableDict[key];
      if (typeof value !== 'string' && typeof value !== 'number')
        return match;                       // unknown or non-scalar: leave as is
      replaced_in_last_pass.push(key);
      return String(value);
    });
    if (replaced_in_last_pass.length === 0)
      return removeUnresolvedCmdParameters(cmd);
  }

  throw new Error(
    `Variable substitution does not end for command '${original}'. ` +
    `Check these variables for references to themselves: ${[...new Set(replaced_in_last_pass)].join(', ')}`
  );
}
```

Notes:
* Behaviour for non-recursive configs is unchanged: known placeholders are replaced, unknown ones (e.g. shell `$(pwd)`) stay.
* The placeholder character class must cover all key names in use. Check the keys produced by `getSourceProperties` (`global.cmds.<name>` with `-` and `.`). If a key contains other characters, extend the class.
* The thrown error propagates to `show_changes`, which shows it to the user.


# Tests

Unit tests (pure function, no VS Code needed):
* `replaceCmdParameters('CRTPGM PGM($(TARGET_LIB)/$(OBJ_NAME))', {TARGET_LIB: 'lib', OBJ_NAME: 'pgm'})` → `CRTPGM PGM(lib/pgm)`
* nested: `{A: '$(B)', B: 'x'}`, `'$(A)'` → `x`
* key with dot/dash: `{'global.cmds.add-lible': 'ADDLIBLE'}`, `'$(global.cmds.add-lible)'` → `ADDLIBLE`; `'$(globalxcmds.add-lible)'` stays unchanged
* self reference `{A: 'x $(A)'}` → throws, message contains `A`
* cycle `{A: '$(B)', B: '$(A)'}` → throws, message contains `A` and `B`
* unknown placeholder `'$(pwd)'` stays


### Definition of done
* `replaceCmdParameters` is iterative, uses one regex, and has a pass limit
* Self references and cycles produce an error naming the variables instead of a stack overflow
* Unit tests above pass; existing compile-lists for the test workspace are unchanged (snapshot comparison)
* CHANGELOG entry
