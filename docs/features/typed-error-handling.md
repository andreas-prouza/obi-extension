# Current situation

Error handling throughout the codebase uses `catch (e: any)` / `catch (error: any)`
(`extension.ts`, `OBICommands.ts`, `DirTool.ts`, `OBITools.ts`, `SSH_Tasks.ts`, `I_Releaser.ts`, ...).
Combined with `strict: false` in `tsconfig.json`, caught errors are effectively untyped and their
shape (`.message`, `.stack`) is assumed rather than checked.

# New feature

## Type-safe error handling

### Definition of done
* Replace `catch (e: any)` with `catch (e: unknown)` across the codebase
* Add a small shared helper, e.g. `getErrorMessage(e: unknown): string`, that narrows via
  `e instanceof Error` and falls back to `String(e)`
* Update call sites (`logger.error(error, error.stack)`, `error.message`) to use the helper instead of
  assuming `Error` shape
* This depends on / pairs with [strict-typescript.md](strict-typescript.md)
