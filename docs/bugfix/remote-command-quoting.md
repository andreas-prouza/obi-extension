# Remote command quoting

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🔴 | finished (unit/integration tests; not yet run against an IBM i) | [security.md S2](../improvements/security.md#s2--remote-shell-commands-lose-their-quoting) | [test-setup.md](test-setup.md) |

Related: [features/command-injection-hardening.md](../features/command-injection-hardening.md) (local side). Required by: [remote-delete-guard.md](remote-delete-guard.md), [remote-home-directory.md](remote-home-directory.md).


# Current situation

`SSH_Tasks.get_finalized_command()` ([SSH_Tasks.ts:41-45](../../src/extension/utilities/SSH_Tasks.ts#L41-L45)) wraps every remote command like this:

```ts
return `bash -c '${cmd.replace(/'/g, "''")}'`.replace("${workspaceFolderBasename}", ...);
```

`''` is not an escaped quote in POSIX shells: it closes and reopens the string. All single quotes inside `cmd` disappear before the inner `bash` sees the command. Reproduced locally:

```
bash -c 'cd ''/tmp/my dir'' || exit 1; echo inner-ok'
bash: line 1: cd: too many arguments
```

Affected call sites (values are interpolated without real quoting):

| Call site | Interpolated values |
|---|---|
| [OBICommands.ts:163-168](../../src/extension/obi/OBICommands.ts#L163-L168) `generate_build_script` | `remote-base-dir`, remote python, `remote-obi-dir`, `--source` |
| [OBICommands.ts:200-201](../../src/extension/obi/OBICommands.ts#L200-L201) `execute_remote_build` | `remote-base-dir`, remote python, `remote-obi-dir` |
| [OBICommands.ts:518-519](../../src/extension/obi/OBICommands.ts#L518-L519) `get_remote_source_list` | same |
| [SSH_Tasks.ts:215-238](../../src/extension/utilities/SSH_Tasks.ts#L215-L238) `check_remote_paths` | each path in `ls "…"` (double quotes, no `bash -c`) |
| [SSH_Tasks.ts:243-264](../../src/extension/utilities/SSH_Tasks.ts#L243-L264) `delete_sources` | file paths, unquoted (fixed in [remote-delete-guard.md](remote-delete-guard.md)) |

On top of that, the quote character for `--source=` is chosen by the **local** platform (`"` on Windows, [OBICommands.ts:165](../../src/extension/obi/OBICommands.ts#L165)), although the command runs in the remote bash.

Side effect to keep in mind: because quotes are lost today, `~` and `$USER` inside `remote-base-dir` are currently expanded by the **remote** shell. With correct quoting they no longer are, so all remote paths must be resolved before they are quoted (step 3).


# Fix

## 1. Add a quoting helper

New file `src/shared/ShellQuote.ts`:

```ts
/** Quotes a value for POSIX sh/bash: the result is always exactly one shell word. */
export function sh_quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Characters OBI accepts in source paths (lib/file/member.ext). Defense in depth, quoting is still required. */
const SOURCE_PATH_PATTERN = /^[A-Za-z0-9_$#@.\-\/]+$/;

export function assert_valid_source_path(source: string): void {
  if (!SOURCE_PATH_PATTERN.test(source) || source.split('/').includes('..'))
    throw new Error(`Source name '${source}' contains unsupported characters`);
}
```

`assert_valid_source_path` should be shared with the local hardening in [command-injection-hardening.md](../features/command-injection-hardening.md).

## 2. Fix `get_finalized_command`

```ts
public static get_finalized_command(cmd: string): string {
  return `bash -c ${sh_quote(cmd)}`;
}
```

* Remove the `${workspaceFolderBasename}` replacement here. The placeholder is resolved in step 3, before quoting. Today only the first occurrence is replaced, and it is replaced after quoting.

## 3. Resolve remote paths before building commands

* Add `SSH_Tasks.get_remote_base_dir(): Promise<string>` and `SSH_Tasks.get_remote_obi_dir(): Promise<string>`. Both return `get_finalized_remote_path(config value)`, so `~`, `$USER` and `${workspaceFolderBasename}` are resolved locally.
* Use them in `generate_build_script`, `execute_remote_build`, `get_remote_source_list` and `OBITools.get_remote_obi_python_path()`.
* Remove the duplicated `${remote-obi-dir}/venv/bin/python` strings ([OBICommands.ts:514](../../src/extension/obi/OBICommands.ts#L514), [OBITools.ts:292](../../src/extension/utilities/OBITools.ts#L292)) and use `Constants.REMOTE_OBI_PYTHON_PATH` in `get_remote_obi_python_path()`.

## 4. Quote every interpolated value

Build commands only from constants and `sh_quote()`d values, e.g.:

```ts
const base = await SSH_Tasks.get_remote_base_dir();
const obi_dir = await SSH_Tasks.get_remote_obi_dir();
let ssh_cmd = `cd ${sh_quote(base)} || exit 1; rm log/* .obi/log/* 2> /dev/null || true; `
            + `${sh_quote(`${obi_dir}/${Constants.REMOTE_OBI_PYTHON_PATH}`)} -X utf8 ${sh_quote(`${obi_dir}/main.py`)} -a create -p .`;
if (source_list.length == 1) {
  assert_valid_source_path(source_list[0]);
  ssh_cmd += ` --source=${sh_quote(source_list[0])}`;
}
```

* The globs `log/*` and `.obi/log/*` are constants and stay unquoted.
* Never derive the remote quote character from `process.platform`.
* `check_remote_paths`: build `ls -d -- ${sh_quote(p)}` per path, joined with ` && `, and run it through `get_finalized_command` like every other remote command.

## 5. Log the command once

`executeCommand` logs the finalized command. Keep that, because the quoted form is what actually runs.


# Edge cases

* `remote-base-dir` with spaces, `'`, `$`, or a leading `~/`.
* `remote-base-dir = "${workspaceFolderBasename}"` (template default, relative path). It must stay relative to the SSH login directory, so do not prefix it.
* Source names with `$`, `#`, `@` (valid IBM i names) are accepted. Names containing `'`, `` ` ``, `;`, `|`, `&` or spaces are rejected with a clear error message before anything is executed.
* Windows clients: the remote command must be identical to the one from Linux/macOS clients.


# Tests

Unit tests (no IBM i needed):
* `sh_quote` for `abc`, `a b`, `it's`, `$(id)`, `` `id` ``, `a;b`, `''`.
* On POSIX CI runners: run `sh -c "printf '%s\n' ${sh_quote(x)}"` locally and assert the output equals `x` for all values above.
* `get_finalized_command("cd '/tmp/my dir' && pwd")` executed locally with `sh -c` succeeds when `/tmp/my dir` exists.
* `assert_valid_source_path` accepts `lib/qrpglesrc/a$b#1.rpgle.pgm` and rejects `x';id;'`, `a b`, `../x`.


### Definition of done
* `sh_quote` and `assert_valid_source_path` exist and are used for every value interpolated into a remote command
* `get_finalized_command` uses `sh_quote` and no longer replaces placeholders
* No remote command depends on `process.platform`
* Remote paths are resolved (`~`, `$USER`, `${workspaceFolderBasename}`) before quoting; an existing project with `remote-base-dir = "~/proj"` still builds
* `check_remote_paths` quotes its paths
* Unit tests above pass on Linux and Windows CI (the `sh -c` round-trip test only on POSIX)
* CHANGELOG entry: "Security: fix quoting of remote commands"
