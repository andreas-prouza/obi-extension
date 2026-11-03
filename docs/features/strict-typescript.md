**Status:** ready (strict mode and the two checks are on; 116 `any` left)

# Current situation

`tsconfig.json` has `"strict": false` and all additional strict checks
(`noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedParameters`) are commented out.

`any` is used 150+ times across the codebase (`OBITools.ts`, `OBICommands.ts`,
`dependency.ts`, `add_sources.ts`, `BuildSummary.ts`, `AppConfig.ts`, ...),
including on public function return types (e.g. `get_compile_list(): any | undefined`).

This contradicts [CLAUDE.md](../../CLAUDE.md), which states "TypeScript strict mode, no `any`".

# New feature

## Enable strict mode incrementally

### Definition of done
* Enable `"strict": true` in `tsconfig.json`
* Fix resulting compile errors file by file (start with `shared/` since it defines core types)
* Replace `any` with proper interfaces/types where the shape is known (e.g. compile-list, source config)
* Where the shape is genuinely dynamic, use `unknown` + narrowing instead of `any`
* Add `noImplicitReturns` and `noFallthroughCasesInSwitch` once strict mode is clean
* Update `CLAUDE.md` if any exemptions remain (e.g. webview glue code), so the doc matches reality


## Status

* Finished: `"strict": true`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, without exemptions. No cast was added to silence an error in production code, except the result of `override_dict` in `AppConfig.load_configs`.
* Open: 116 explicit `any` (ESLint warnings, counted in the baseline). Most are the compile list and the config in `compile_list/modules`. Types derived from `compile-list.schema.json` ([json-schemas.md](json-schemas.md), step 4) would remove most of them. `CLAUDE.md` says "no `any`", so this stays open.
