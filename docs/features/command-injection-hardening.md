# Current situation

`SystemCmdExecution.run_system_cmd()` ([src/extension/utilities/SystemCmdExecution.ts](../../src/extension/utilities/SystemCmdExecution.ts))
runs `spawn(cmd, { cwd, shell: true })` where `cmd` is a string built by concatenation, e.g. in
`OBICommands.ts`:

```ts
cmd = `${cmd} --source=${quote}${source}${quote}`;
```

`source` is only wrapped in a quote character chosen by platform, with no escaping. A source/member
name containing a quote, backtick, or `$()` would be interpreted by the shell.

`OBICommands.run_system_cmd()` in [src/extension/obi/OBICommands.ts](../../src/extension/obi/OBICommands.ts)
is a second, unused/dead implementation that calls `fork(cmd, ...)` (wrong API for a shell command string)
immediately followed by an ignored `spawn(cmd, { cwd, shell: true })`.

# New feature

## Harden system command execution

### Definition of done
* Remove the dead `OBICommands.run_system_cmd()` (the `fork` + ignored `spawn` implementation)
* Route all system command execution through the single `SystemCmdExecution` class
* Replace shell string concatenation with `spawn(command, argsArray, { cwd, shell: false })` so arguments
  (like `source`) are passed as separate array elements instead of being interpolated into a shell string
* If `shell: true` is required for a specific platform quirk, explicitly escape/validate any
  interpolated value (allow-list characters valid in IBM i source/member names) before interpolation
* Add a regression test asserting a source name containing `'`, `` ` ``, `$(`, `;` does not break out of
  the intended argument boundary
