# HealthyWatchdog: deleted folders are recreated after the callbacks ran

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟡 | finished (integration test in ConfigCache.test.ts; fails on the old code) | [improvements v2.2.3 R7](../improvements/v2.2.3/README.md) | – |


# Current situation

When a project folder (`Constants.NEEDED_LIST_OF_PATH`: `.obi/etc`, `.obi/source-list`, `.obi/build-output`, `.obi/build-history`, `.obi/tmp`) is deleted, `HealthyWatchdog` awaits `recreate_deleted_folder()` and then runs the file callbacks (refresh views, reset caches). `recreate_deleted_folder` used `forEach` with the callback form of `fs.mkdir`, so it resolved at once: the callbacks could run while the folders didn't exist yet.


# Fix

`recreate_deleted_folder` ([HealthyWatchdog.ts](../../src/extension/utilities/HealthyWatchdog.ts)) creates the missing folders one after the other with `await fs.promises.mkdir(…, { recursive: true })` and resolves when they exist. A folder that can't be created shows its error as before; the next folders are still created.


# Tests

Integration ([ConfigCache.test.ts](../../src/test/suite/ConfigCache.test.ts)), in a temporary folder (the watchdog of the running extension watches the test workspace):

* All folders exist when the promise resolves. On the old code the test fails here (`ENOENT` for `.obi/etc`).
* A file in the way of `.obi/build-output`: one error message naming the folder, the folders after it in the list are created.


# Definition of done

* [x] Fix and test
* [x] No user docs or CHANGELOG entry: not visible to users
* [x] Entry R7 removed from the improvement list
