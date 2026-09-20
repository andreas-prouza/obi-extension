# Current situation

`src/extension/utilities/OBITools.ts` and `src/extension/obi/OBICommands.ts` each mix multiple
responsibilities in one file: config access, compile-list read/write/merge, SSH orchestration
triggers, and UI/command handling all live side by side. This makes both files large and hard to
navigate, and encourages duplicate implementations (see
[command-injection-hardening.md](command-injection-hardening.md) for the duplicated
`run_system_cmd`).

# New feature

## Split large multi-responsibility files

### Definition of done
* Extract compile-list read/write/merge helpers out of `OBITools.ts` into
  `extension/obi/compile_list/modules/` alongside the existing modules (`dependency.ts`,
  `add_sources.ts`, ...)
* Extract SSH/remote-transfer triggering out of `OBICommands.ts` into a dedicated module
* Keep `OBICommands.ts` focused on registering and wiring `vscode.commands` handlers, delegating
  actual logic to the extracted modules
* No behavior change intended — this is a pure refactor, verify via existing/expanded tests
  (see [test-coverage.md](test-coverage.md))
