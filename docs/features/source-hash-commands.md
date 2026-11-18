**Status:** ready

# Current situation

The compiled object list (`general.compiled-object-list`, default `.obi/etc/object-builds.json`) holds the hash of every source of the last successful build. *Show changes* compares it with the current hashes: missing → new source, different → changed source.

It can only be changed as a whole (*Reset compiled object list*: every source counts as built) or by a build (successful sources get their hash). For a single source, the file has to be edited by hand.


# New feature

As a user I want to set the current hash of a source in the compiled object list, or remove it.

## Definition of done
* Two commands, in the submenu `obi.source` (*OBI*, together with the other source actions) of the context menu of a source in the source list, in the Explorer (files only) and on the editor tab, and in the Command Palette (active editor):
  * `obi.source.store-hash` — *OBI: Mark source as built (store current hash)*: MD5 of the file (same as the change detection, `md5_file`) stored under the source name (`lib/file/member`). Only for `supported-object-types` and existing files
  * `obi.source.remove-hash` — *OBI: Mark source as changed (remove hash)*: removes the entry
* Other entries are kept; an invalid file is not overwritten (`ConfigFileError`, with the position)
* Runs under the operation lock: a build writes the same file at its end
* A message says what was done, also when nothing changed (hash already stored, no hash to remove)
* No change on the IBM i side: `.obi/etc` goes up with the next transfer, so the backend sees the same list when it creates the build list
* Integration tests ([SourceHash.test.ts](../../src/test/suite/SourceHash.test.ts))
