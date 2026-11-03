# Typed and validated webview messages

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (requests typed and validated for all panels; extension → page events are not typed yet) | [security.md S7](../improvements/security.md#s7--webview-messages-are-trusted-without-validation), [maintainability.md M11](../improvements/maintainability.md#m11--webview-message-protocol-is-untyped) | – |

Related: [bugfix/profile-name-validation.md](../bugfix/profile-name-validation.md), [webview-csp.md](webview-csp.md).


# Current situation

* Every webview handler takes `message: any` and trusts its fields:
  * `BuildSummary` `file_content` returns the content of **any** path the page sends ([BuildSummary.ts:126-133](../../src/webview/show_changes/BuildSummary.ts#L126-L133));
  * `open_file` joins `message.source` without a traversal check ([BuildSummary.ts:115-124](../../src/webview/show_changes/BuildSummary.ts#L115-L124));
  * `save_custom_data` stores arbitrary data under arbitrary keys ([BuildSummary.ts:135-145](../../src/webview/show_changes/BuildSummary.ts#L135-L145));
  * `OBIConfiguration.save_config` deep-merges arbitrary objects into TOML files, without a guard against `__proto__` / `constructor` / `prototype` keys ([OBIConfiguration.ts:434-447](../../src/webview/controller/OBIConfiguration.ts#L434-L447));
  * `change_profile` accepts any string ([OBIController.ts:243-245](../../src/webview/controller/OBIController.ts#L243-L245)).
* Message names are free-form strings on both sides, e.g. `"${class_prefix}_save"` built at runtime in [config.ts](../../src/webview/controller/javascript/config.ts). Typos fail silently.

A script that runs in a webview (see [security.md S5/S6](../improvements/security.md#s5--stored-xss-in-the-source-description-editor)) can therefore read local files and write configuration.


# New feature

## Shared message types

New folder `src/shared/messages/`, one file per panel, e.g. `BuildSummaryMessages.ts`:

```ts
export type BuildSummaryRequest =
  | { command: 'show_log'; type: 'joblog' | 'stdout' | 'stderr'; level: string; source: string; cmd_index: number }
  | { command: 'run_build'; ignore_sources: string[]; ignore_sources_cmd: Record<string, string[]> }
  | { command: 'open_file'; source: string }
  | { command: 'add_source' }
  | { command: 'edit_cmd'; level: string; source: string; cmd_index: number }
  | { command: 'save_custom_data'; type: string; data: unknown };

export type BuildSummaryEvent =
  | { command: 'state'; … };
```

* The webview scripts import these types (they are type-only, nothing is bundled) and send only typed messages.
* `config.ts`: replace `` `${class_prefix}_save` `` with `{ command: 'save_config', target: 'user' | 'project', data }`.

## Validation at the boundary

New helper `src/extension/utilities/MessageGuard.ts` with small, dependency-free validators:

```ts
export function is_string(v: unknown): v is string
export function is_string_array(v: unknown): v is string[]
export function is_plain_object(v: unknown): v is Record<string, unknown>   // also rejects __proto__/constructor/prototype keys, recursively
export function workspace_path(relative: string): string | undefined          // resolve + must stay inside the workspace
```

Each `onReceiveMessage` handler:
1. checks `command` against the union (unknown command → log a warning, ignore);
2. validates the fields of that command (wrong type → log a warning, ignore);
3. only then acts.

## Command-specific rules

| Message | Rule |
|---|---|
| `file_content` | **Remove**. It has no sender in [show_changes.ts](../../src/webview/show_changes/javascript/show_changes.ts). If it's needed later, restrict it to files inside the workspace via `workspace_path`. |
| `open_file`, `show_log`, `edit_cmd` | `source` must match `assert_valid_source_path` ([remote-command-quoting.md](../bugfix/remote-command-quoting.md)), and the resolved path must stay inside the source folder |
| `save_custom_data` | `type` must match `^[a-z][a-z0-9_-]{0,63}$`; `data` must be a plain object or primitive, max. 1 MB serialized |
| `save_config` (config panel) | `data` must be a plain object without prototype keys; only the top-level keys `connection`, `general`, `global` are merged |
| `change_profile` | `is_known_profile()` ([profile-name-validation.md](../bugfix/profile-name-validation.md)) |
| Source config / dependency / filter panels | `source`, `key` are non-empty strings; `key` must not contain `.` or start with `__` |

## Merge without prototype pollution

Replace `mergeRecursive` in `OBIConfiguration.save_config` with a shared `safe_merge(target, source)` that skips the keys `__proto__`, `constructor` and `prototype`, and only copies own enumerable properties.


# Tests

* Unit tests for `MessageGuard`: `is_plain_object(JSON.parse('{"__proto__":{"x":1}}'))` → false; `workspace_path('../../etc/passwd')` → undefined; `workspace_path('.obi/etc/app-config.toml')` → absolute path inside the workspace.
* Unit test: `safe_merge({}, JSON.parse('{"__proto__":{"polluted":true}}'))` leaves `({} as any).polluted` undefined.
* Unit test per panel: an unknown command and a command with wrong field types are ignored without throwing.


### Definition of done
* Every webview panel has a typed request/event union used by both sides
* All handlers validate commands and fields before acting
* `file_content` removed (or restricted to the workspace); paths are checked against the workspace or source folder
* No prototype pollution through config merges
* Unit tests pass; CHANGELOG entry
