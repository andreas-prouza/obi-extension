# `.gitignore` in the project template

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (entries in code instead of `obi-media/.gitignore`, so they don't affect this repository; `object-builds.json` local as documented) | [security.md S10](../improvements/security.md#s10--project-template-has-no-gitignore) | – |


# Current situation

*Initialize* ([OBITools.ts:435-466](../../src/extension/utilities/OBITools.ts#L435-L466)) copies [obi-media/](../../obi-media/) into the workspace. The template has no `.gitignore`, so personal and generated files end up in commits:

| Path | Content |
|---|---|
| `.obi/etc/.user-app-config*.toml` | SSH user, personal settings, possibly `secret*` variables |
| `.obi/etc/.user-extended-source-processing-config*.toml` | personal ESP rules |
| `.obi/etc/workspace-settings.json` | currently selected profile |
| `.obi/log/` | extension and OBI logs (commands, remote output) |
| `.obi/tmp/`, `.obi/build-output/` | generated per build |
| `.obi/build-history/` | build snapshots incl. merged config ([bugs.md #1](../bugs.md#1--secret-variables-are-stored-in-plain-text-in-the-build-history)) |
| `.obi/etc/source-list-remote.json` | remote source hashes (generated) |


# New feature

## Ship a `.gitignore`

New file `obi-media/.gitignore`:

```gitignore
# OBI: personal configuration
.obi/etc/.user-app-config*.toml
.obi/etc/.user-extended-source-processing-config*.toml
.obi/etc/workspace-settings.json

# OBI: generated
.obi/log/
.obi/tmp/
.obi/cache/
.obi/build-output/
.obi/build-history/
.obi/etc/source-list-remote.json
```

## Existing projects

`initialize_folder` copies with `force: false`, so an existing `.gitignore` is never overwritten. For existing projects:
* After activation, if the workspace is a git repository and `git check-ignore -q .obi/log/combined.log` reports "not ignored", show once per workspace (`workspaceState`):
  > Some OBI files with personal settings or build output are not ignored by git. Add the recommended entries to `.gitignore`?

  Buttons: `Add entries` (appends the block above, skipping lines that already exist) / `Not now` / `Don't ask again`.
* Use `execFile('git', [...])` without a shell, like [GitInfo.ts](../../src/extension/utilities/GitInfo.ts) does.


# Open questions

* Is `.obi/etc/object-builds.json` (hashes of the last successful build) per developer or shared by the team? It depends on whether developers share one remote build folder. Decide before adding it to the template, and document the decision in [configuration.md](../../asserts/docs/configuration.md).
* Same question for `.obi/etc/dependency.json` (normally shared, so it stays committed).


### Definition of done
* `obi-media/.gitignore` exists with the entries above
* Existing projects are offered (once) to add missing entries; existing `.gitignore` content is never removed
* [getting-started.md](../../asserts/docs/getting-started.md) explains which files are personal and which are shared
* CHANGELOG entry
