# Graph-based dependency resolution

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (characterization and golden tests unchanged; `objects_tree.json` has a flat format now) | [performance.md P3](../improvements/performance.md#p3--dependency-resolution-scales-quadratically-or-worse) | [bugfix/test-setup.md](../bugfix/test-setup.md), [test-coverage.md](test-coverage.md) (tests for the current behaviour first) |


# Current situation

[dependency.ts](../../src/extension/obi/compile_list/modules/dependency.ts) (`dependency.json` maps each object to the objects it depends on):

* `getTargetDependedObjects` ([lines 82-120](../../src/extension/obi/compile_list/modules/dependency.ts#L82-L120)) finds the dependents of one object by scanning the **whole** dependency dict (`for obj in dict` + `includes`). It recurses per hit, calls `fs.existsSync` and `AppConfig.get_app_config()` on every level, and builds a **tree**: shared dependents (diamonds) are expanded once per path.
* Cycle detection is a heuristic: more than 50 visits of one object.
* `getTargetsByLevel` ([lines 223-259](../../src/extension/obi/compile_list/modules/dependency.ts#L223-L259)) flattens the tree into levels and merges with `deepListMerge`, which runs `structuredClone` per child. `removeDuplicities` then keeps each object only at its highest level.
* `getTargetsOnlyDependedObjects` ([lines 122-163](../../src/extension/obi/compile_list/modules/dependency.ts#L122-L163)) computes the dependents again with another recursion.
* `OBITools.get_dependend_sources` ([OBITools.ts:749-782](../../src/extension/utilities/OBITools.ts#L749-L782)) does it a third time, and **without** the file-existence filter.

Effective semantics, which must be preserved:
* A *target* is a changed or new source.
* An object is *affected* if it (transitively) depends on a target. Dependents whose source file doesn't exist are skipped, and the traversal doesn't continue through them.
* **Level** of an affected object = 1 + the longest dependency path from any target to it. Targets get at least level 1. A target that depends on another target gets a higher level.
* Level 0 = related copybooks if `ALWAYS_TRANSFER_RELATED_COPYBOOKS` is set (`getCopySources`: forward closure of all objects to build, filtered to `.cpy`).
* Within a level, `*.file` objects come first (`orderBuilds`).


# New feature

## `DependencyGraph`

New file `src/extension/obi/compile_list/modules/dependency_graph.ts`:

```ts
export class DependencyGraph {
  /** reverse edges: object → objects that depend on it */
  private readonly dependents = new Map<string, Set<string>>();
  private readonly depends_on = new Map<string, Set<string>>();

  constructor(dependency_dict: Record<string, string[]>, exists: (source: string) => boolean)

  /** All objects that transitively depend on one of the targets (targets excluded). BFS, O(V+E). */
  affected_by(targets: string[]): string[]

  /** Build levels for targets + affected objects (longest path layering). Throws DependencyCycleError. */
  build_levels(targets: string[]): { level: number; sources: string[] }[]

  /** Forward closure (what the given objects depend on), used for related copybooks. */
  dependencies_of(objects: string[]): string[]
}

export class DependencyCycleError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Dependency cycle: ${cycle.join(' → ')}`);
  }
}
```

* `exists` is evaluated at most once per object (memoized) and skips non-existing dependents, as today.
* `build_levels`:
  1. `R = targets ∪ affected_by(targets)`
  2. Kahn's algorithm on the subgraph induced by `R` (edge `p → x` if `x` depends on `p`, both in `R`).
  3. `level[x] = max(1, max(level[p] + 1 for p in predecessors(x) ∩ R))`.
  4. If nodes remain after Kahn's algorithm → find one cycle with DFS among the remaining nodes and throw `DependencyCycleError` with the path.
* `getBuildOrder` uses the graph and keeps writing the debug files (`objects_tree.json`, `ordered_target_tree.json`, `new_target_tree.json`, `dependend-object-list.json`) with equivalent content, so tools that read them keep working. Removing them is a separate decision.
* `getCopySources` → `graph.dependencies_of(all).filter(x => x.toLowerCase().endsWith('.cpy'))`.
* Remove `getTargetDependedObjects`, `getTargetsByLevel`, `removeDuplicities`, `deepListMerge`, `getTargetsOnlyDependedObjects` and `OBITools.get_dependend_sources` / `add_all_dependend_sources`.
* `mergeSourcesIntoCompileList` / `resetDependentStatuses` ([add_sources.ts](../../src/extension/obi/compile_list/modules/add_sources.ts)) use `affected_by` / `build_levels`.


# Tests

**Before** the change, add characterization tests against the current implementation (fixtures with `dependency.json` + existing files), then run them unchanged against the new one:
* chain `a ← b ← c` (c depends on b, b on a), target `a` → levels a:1, b:2, c:3
* diamond `a ← b, a ← c, b ← d, c ← d` → d at level 3, listed once
* two targets where one depends on the other → dependent target gets level 2
* dependent whose file doesn't exist → skipped and not traversed
* cycle `a ← b ← a` → `DependencyCycleError` with message `a → b → a`
* `ALWAYS_TRANSFER_RELATED_COPYBOOKS`: `.cpy` forward dependencies at level 0
* `*.file` first within a level

Performance test (not in CI, documented): 5,000 objects, 20,000 edges, 200 targets → `build_levels` < 200 ms.


### Definition of done
* One graph implementation for build order, dependents and copybooks
* Levels identical to the current behaviour (characterization tests)
* Exact cycle detection with the cycle path in the error
* Old functions removed; no `structuredClone` in dependency resolution
* CHANGELOG entry
