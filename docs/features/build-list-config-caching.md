# Load configuration once per build-list run

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🔴 | finished (golden test; ESP config is still read once per getBuildPlan) | [performance.md P2](../improvements/performance.md#p2--source-configtoml-is-parsed-about-5-per-source-and-the-full-config-is-cloned-on-every-lookup), part of [P12](../improvements/performance.md#p12--synchronous-file-io-in-hot-paths) | [bugfix/test-setup.md](../bugfix/test-setup.md) |

Related: [bugfix/self-referencing-variable.md](../bugfix/self-referencing-variable.md) (same module), [compile-list-size.md](compile-list-size.md).


# Current situation

For every source in the build list, `addBuildCmds` ([build_cmds.ts:9-24](../../src/extension/obi/compile_list/modules/build_cmds.ts#L9-L24)) triggers:

| Call | Reads / parses `source-config.toml` | `structuredClone` of the full config |
|---|---|---|
| `getObjectList` → `getSourceProperties` | 1× | 5× (`getTableElement` calls) |
| `getSourceBuildCmds` | 1× (own `get_toml`) | – |
| ↳ `getSteps` → `getExtendedSteps` → `getSourceProperties` (if ESP config exists) | 1× | 5× |
| ↳ `getSourceProperties` | 1× | 5× |
| ↳ per step: `getCmdFromStep` → `resolveCmdId` (+ one per `%word%`) | – | 1× per lookup |
| `sourceItem.variables = getSourceProperties(...)` | 1× | 5× |

That is about 5 synchronous TOML parses and 20+ deep clones of the complete config per source.

`getTableElement` ([toml_tools.ts:2-24](../../src/extension/obi/compile_list/modules/toml_tools.ts#L2-L24)) clones the whole object before walking into it. `getSourceProperties` relies on that clone, because it deletes the `secret*` keys from the returned `global.variables`.

`getCmdFromStep` writes `variableDict['SET_LIBL']` into the object it received ([build_cmds.ts:89](../../src/extension/obi/compile_list/modules/build_cmds.ts#L89)).


# New feature

## 1. Build-list context

New type in `src/extension/obi/compile_list/modules/context.ts`:

```ts
export interface BuildListContext {
  readonly workspace: string;
  readonly app_config: Readonly<AppConfig>;
  readonly source_configs: Readonly<SourceConfigList>;          // parsed once
  readonly esp_config: Readonly<{ extended_source_processing: ExtendedSourceProcessing[] }>;
  readonly properties_cache: Map<string, Readonly<SourceProperties>>;
}

export function create_build_list_context(): BuildListContext
```

* Created once in `createBuildList` and in `mergeSourcesIntoCompileList` / `getBuildOrder`, then passed down instead of `appConfig` + implicit file reads.
* `source-config.toml` is read with the strict reader from [config-overwrite-on-parse-error.md](../bugfix/config-overwrite-on-parse-error.md), so a broken file stops the run with a clear message.

## 2. Properties once per source

* `getSourceProperties(ctx, source)` checks `ctx.properties_cache` first and stores a frozen result (`Object.freeze`).
* Callers that need to add values (`step_properties`, `SET_LIBL`) build a new object (`{ ...props, ...step.properties }`) instead of mutating.

## 3. `getTableElement` without cloning

```ts
export function getTableElement(toml: Record<string, unknown>, tree: string[], add_path = false): unknown {
  let node: unknown = toml;
  for (const entry of tree) {
    if (!node || typeof node !== 'object' || !(entry in node)) return null;
    node = (node as Record<string, unknown>)[entry];
  }
  if (add_path && node && typeof node === 'object' && !Array.isArray(node))
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [`${tree.join('.')}.${k}`, v]));
  return node;
}
```

* `getSourceProperties` copies `global.variables` (`{ ...vars }`) before removing `secret*` keys, so the config is never mutated.
* Freeze `ctx.app_config` in tests (deep freeze helper) to detect any remaining mutation.

## 4. ESP and step resolution

* `getActiveExtendedSourcesConfig()` is read once into `ctx.esp_config` (today once per `getBuildOrder`, which is fine, but `addBuildCmds` receives it separately).
* `resolveCmdId` gets `{ ...ctx.app_config, ...source_config }` once per source, not per step.

## 5. Git info

`write_compile_list` refreshes git info on every write, which [build-summary.md](build-summary.md) requires. Keep that. `GitInfo` reads `.git/HEAD` directly and only spawns `git` (synchronously) for worktrees and submodules; leave it as is.


# Tests

* Golden test: generate the compile-list for `test-resources/appconfig` with a set of changed sources before the refactoring and store it; after the refactoring the output must be identical (ignore `timestamp` and `git`).
* Unit test: `DirTool.get_toml` is called once for `source-config.toml` per `createBuildList` run (sinon spy).
* Unit test: after `getSourceProperties`, the `global.variables` of the config still contain the `secret*` keys (no mutation).


### Definition of done
* `source-config.toml`, app config and ESP config are read once per build-list run
* Source properties are computed once per source and not mutated afterwards
* `getTableElement` doesn't clone; no code mutates the shared config
* Golden test passes; CHANGELOG entry
