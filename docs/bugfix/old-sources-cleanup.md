# Remote source check: "old sources" are never detected

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟡 | finished: **removed** (decision 2026-10-23). Setting, both hidden commands, `remote-source-list`, `check_remote_sources`, `get_remote_source_list` and `SSH_Tasks.delete_sources` are gone | [reliability.md R13](../improvements/reliability.md#r13--old-sources-clean-up-can-never-trigger) | [remote-delete-guard.md](remote-delete-guard.md) (`delete_sources`) |


# Current situation

* `OBITools.compare_source_change` ([OBITools.ts:817-865](../../src/extension/utilities/OBITools.ts#L817-L865)) declares `old_sources = []` and never fills it.
* So the branch in `process_check_remote_sources` that offers to delete sources that exist only on the IBM i ([OBITools.ts:396-407](../../src/extension/utilities/OBITools.ts#L396-L407)) is unreachable. If it ran, it would report "Sources transfered" after deleting.
* `compare_source_change` wraps purely synchronous logic in one promise per source (`check_source_change_item`), which is unnecessary overhead.
* The feature is reachable via the setting `check-remote-source-on-startup` and the (hidden) command `obi.check-remote-sources`.


# Decision needed

Either **implement** the clean-up (below) or **remove** the remote source check entirely (setting, command, `get_remote_source_list`, `check_remote_sources`). The command is already hidden (`when: … && false`). The setting is still documented in [configuration.md](../../asserts/docs/configuration.md).


# Fix (if implemented)

## 1. Pure comparison function

```ts
export function compare_source_hashes(current: Record<string, string>, previous: Record<string, string>): source.ISourceList {
  const new_objects: string[] = [], changed: string[] = [], old: string[] = [];
  for (const [src, hash] of Object.entries(current)) {
    if (!(src in previous)) new_objects.push(src);
    else if (previous[src] !== hash) changed.push(src);
  }
  for (const src of Object.keys(previous))
    if (!(src in current)) old.push(src);
  return { 'new-objects': new_objects, 'changed-sources': changed, 'old-sources': old };
}
```

* Normalise keys to `/` before comparing (today done in `check_source_change_item`).
* `retrieve_current_source_hashes` returns an array of one-key objects. Convert to a map once (`Object.assign({}, ...list)`), or change its return type to `Record<string, string>` (also see [features/source-hashing.md](../features/source-hashing.md)).
* `get_changed_sources` (local build) uses the same function and simply ignores `old-sources`.

## 2. Confirmation and deletion

* Dialog: "`<n>` sources exist only on `<host>` and not locally. Delete them on the IBM i?" Show at most 20 names, plus "… and `<n-20>` more". Use a warning, not an error message.
* Delete with `SSH_Tasks.delete_sources` (quoted and validated, see [remote-delete-guard.md](remote-delete-guard.md)), and report the result: "Deleted `<n>` sources on `<host>`" or the list of failures.


# Tests

* `compare_source_hashes({a:'1', b:'2'}, {a:'1', b:'x', c:'3'})` → new `[]`, changed `['b']`, old `['c']`.
* Backslash keys in `current` match `/` keys in `previous`.


### Definition of done
* Decision recorded (implement or remove)
* If implemented: old sources are detected, confirmed and deleted safely with a correct result message; `compare_source_change` is synchronous and tested
* If removed: setting, command, code and docs are gone
* CHANGELOG entry
