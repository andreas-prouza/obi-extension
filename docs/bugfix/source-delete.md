# Delete source member: no confirmation, stale metadata

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟠 | finished (integration tests in SourceDelete.test.ts, full suite stable in 3 runs) | [improvements v2.2.3 R4](../improvements/v2.2.3/README.md), [bugs.md #2](../bugs.md#2--delete-source-member-has-no-confirmation-and-leaves-stale-config) | – |


# Current situation

*Delete* on a member in the Source filters tree (`obi.source-filter.delete-source-member`) called `fs.unlinkSync` at once: no confirmation, no trash, no error handling (the rename command has it). The source stayed in `source-config.toml`, `dependency.json`, `object-builds.json`, `source-infos.json` and the build packages, although `sync_renamed_source_member` already updates all of them on a rename. A build package with the deleted source then refused to create a build list.


# Fix

* `delete_source_member` ([SourceListProvider.ts](../../src/webview/source_list/SourceListProvider.ts)):
  * Modal warning *Delete source {0}?*, naming the build packages that contain the source and the sources that use it (at most 10 each).
  * The file goes to the trash (`workspace.fs.delete` with `useTrash`). If that fails (no trash, e.g. in some remote windows), a second modal question offers *Delete permanently*.
  * Then `remove_deleted_source` removes the source from the project files. If that fails, the message says that the file is deleted but the project files weren't updated completely.
  * The command handler catches errors like the rename command.
* `remove_deleted_source(source)`, next to `sync_renamed_source_member`:
  * `source-config.toml`: the key of the source.
  * `dependency.json` (`DependencyList.remove_source`): the source's own entry and the references of other sources, as a rename renames both. The confirmation lists those sources.
  * `object-builds.json`: `OBITools.set_source_hash(source, undefined)`. Nothing else uses it to find deleted sources (the old-sources check was removed, and the backend has none).
  * Build packages: `BuildPackageStore.remove_source_everywhere`. Packages that can't be read are reported, the others are updated.
  * `source-infos.json`: `LocalSourceList.remove_source_info` works on the file, not on the cache. The cache leaves out sources whose file is missing, so after the delete (and the watcher's reload) it may not know the source any more. That race made the first version of the test flaky.

Not changed: deleting a file in the VS Code Explorer. It keeps VS Code's own confirmation and undo, and a cleanup of the project files couldn't be undone with it.


# Tests

Integration ([SourceDelete.test.ts](../../src/test/suite/SourceDelete.test.ts)); the file delete is replaced through `SourceListProvider.delete_file`, so no file goes to the desktop's trash and the running extension isn't affected:

* Confirmed: question with package and dependent, file deleted with `useTrash`, the source is gone from all five project files, the settings of other sources stay.
* Cancelled: nothing deleted or changed.
* Without a trash: deleted permanently only after the second confirmation; cancelling it leaves file and project files unchanged.


# Definition of done

* [x] Fix and tests
* [x] [sources.md → Create, rename and delete sources](../../asserts/docs/sources.md#create-rename-and-delete-sources), CHANGELOG
* [x] bugs.md #2 marked fixed, entry R4 removed from the improvement list
