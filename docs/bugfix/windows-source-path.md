# One helper for workspace and source paths (Windows separators)

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟡 | finished (unit tests with `path.win32`; not yet run on Windows) | [reliability.md R11](../improvements/reliability.md#r11--windows-paths-only-the-first-backslash-is-converted) | [test-setup.md](test-setup.md) |

Related: [features/test-coverage.md](../features/test-coverage.md) (path tests).


# Current situation

Local file paths are turned into OBI source names (`lib/file/member.ext`) in several places, each with its own string manipulation:

| Place | Code |
|---|---|
| [extension.ts:301-304](../../src/extension.ts#L301-L304) *Edit compile config* (explorer) | `.replace(ws, '')`, `.replace(src_dir, '')`, **`.replace('\\', '/')`** (first backslash only) |
| [extension.ts:326-329](../../src/extension.ts#L326-L329) *Maintain dependency* (explorer) | same, but with `/\\/g` |
| [OBICommands.ts:261-264](../../src/extension/obi/OBICommands.ts#L261-L264) `get_current_active_source` | `.replace(path.join(ws, src_dir), '')` |
| [OBITools.ts:1065-1077](../../src/extension/utilities/OBITools.ts#L1065-L1077) `convert_local_filepath_2_obi_filepath` | `.replace(ws, '')`, `.replace('src/', '')` |
| [extension.ts:353-379](../../src/extension.ts#L353-L379) rename listener | `convert_local_filepath_2_obi_filepath` + prefix check |
| [SourceListProvider.ts:456-476](../../src/webview/source_list/SourceListProvider.ts#L456-L476) reveal active editor | `convert_local_filepath_2_obi_filepath` + split |

Problems:
* On Windows, *Edit compile config* from the explorer produces `lib/file\member.ext` (only the first backslash is converted). `path.join` still finds the file, but the key doesn't match `source-config.toml`, so the page shows no settings and saves under a wrong key.
* `string.replace(ws, '')` is case-sensitive. VS Code may report `c:\…` while `workspaceFolders[0].uri.fsPath` is `C:\…`, so nothing is replaced.
* `.replace(src_dir, '')` replaces the first match **anywhere**, e.g. in a library named `srclib`.
* `createBuildList` and `SSH_Tasks.transferSources` use `<ws>/<local-base-dir>/<source-dir>` as source root, the other places use `<ws>/<source-dir>`. That's identical only for the default `local-base-dir = "."`.


# Fix

## 1. Helper module

New file `src/extension/utilities/SourcePath.ts`. It is pure, so it can be tested without VS Code; the `path` implementation is injectable for tests:

```ts
import * as path from 'path';

/** fs_path relative to root with '/' separators, or undefined if fs_path is not inside root. */
export function relative_inside(root: string, fs_path: string, p: path.PlatformPath = path): string | undefined {
  const rel = p.relative(root, fs_path);              // win32: case-insensitive
  if (rel === '' || rel.startsWith('..') || p.isAbsolute(rel)) return undefined;
  return rel.split(p.sep).join('/');
}

/** <workspace>/<local-base-dir>/<source-dir> */
export function local_source_root(ws: string, local_base_dir: string | undefined, source_dir: string | undefined, p = path): string {
  return p.join(ws, local_base_dir || '.', source_dir || 'src');
}
```

Plus thin wrappers that read workspace and config:
* `to_obi_source(fs_path: string): string | undefined` → `relative_inside(local_source_root(...), fs_path)`
* `to_workspace_relative(fs_path: string): string | undefined`

## 2. Replace all call sites

* Use `to_obi_source` in the explorer handlers, `get_current_active_source`, the rename listener and the active-editor reveal.
* Keep `convert_local_filepath_2_obi_filepath` only as a wrapper around `to_workspace_relative` (or `to_obi_source` when `remove_src`), mark it `@deprecated`, and remove it once all callers are migrated.
* `OBISourceConfiguration.render` / `OBISourceDependency.render` receive an OBI source name. Assert the `/`-separated form there (`source.includes('\\')` → error in the log).

## 3. Message for files outside the source folder

When `to_obi_source` returns `undefined`, show "`<file>` is not inside the OBI source folder `<root>`", the same text everywhere.


# Tests

Unit tests with `path.win32` and `path.posix`:
* win32: root `C:\ws\src`, file `c:\WS\src\lib\qrpglesrc\a.rpgle.pgm` → `lib/qrpglesrc/a.rpgle.pgm`
* win32: file `C:\ws\srclib\x.pgm` with root `C:\ws\src` → `undefined`
* posix: root `/ws/src`, file `/ws/src/srclib/qrpglesrc/a.pgm` → `srclib/qrpglesrc/a.pgm` (no replacement inside the name)
* posix: file `/other/x.pgm` → `undefined`
* `local_source_root('/ws', 'base', 'src')` → `/ws/base/src`


### Definition of done
* All conversions from local paths to OBI source names go through `SourcePath.ts`
* *Edit compile config* from the Windows explorer opens the existing settings of the source
* `local-base-dir` is respected consistently
* Unit tests run on Linux and Windows CI
* CHANGELOG entry
