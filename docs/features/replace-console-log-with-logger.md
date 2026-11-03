**Status:** finished (Unreleased)

# Current situation

Raw `console.log` debug statements are used throughout production code instead of the existing
`winston`-based `logger` ([src/extension/utilities/Logger.ts](../../src/extension/utilities/Logger.ts)),
for example in:
* `src/webview/controller/javascript/config.ts` (30+ occurrences)
* `src/webview/controller/javascript/controller.ts`
* `src/webview/source_list/javascript/*`
* `src/extension/utilities/HealthyWatchdog.ts`
* `src/extension/obi/compile_list/createBuildList.ts`

These bypass log levels, log files, and any future log filtering, and leak debug output into the
webview devtools console / extension host console unconditionally.

# New feature

## Route all logging through the shared logger

### Definition of done
* Replace `console.log` calls in extension-host code (`src/extension/**`) with `logger.debug(...)`
  or `logger.info(...)` as appropriate
* For webview code (`src/webview/**/javascript/*`), either route through a webview-safe logger that
  posts messages to the extension host logger, or gate `console.log` calls behind a debug flag
* Remove logging that was clearly left over from debugging (e.g. dumping full config objects) rather
  than converting it


## Result

* Extension host: no `console.log` left, except the logger's own fallback for tests (`Logger.ts`), which runs before a log channel exists.
* Page scripts: all 56 calls were debugging leftovers and are removed, so no webview logger was needed. The three `console.error` calls stay: they report a broken page in the webview devtools.
* `check-repo` refuses new `console.log` calls.
