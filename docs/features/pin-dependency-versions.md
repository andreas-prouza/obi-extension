# Current situation

`package.json` pins several packages to `"latest"` instead of a fixed/semver range:

* `dependencies`: `wildcard-match`, `winston`, `winston-transport`

`"latest"` means every fresh `npm install` can silently resolve to a different (potentially
breaking or compromised) version, which breaks reproducible builds and is a supply-chain risk.

# New feature

## Pin all dependency versions

### Definition of done
* Replace `"latest"` with the currently resolved version (semver range, e.g. `^3.x.x`) for
  `wildcard-match`, `winston`, `winston-transport`
* Run `npm install` and commit the updated `package-lock.json`
* Add a CI or pre-commit check (or a note in `CLAUDE.md`) that forbids adding new `"latest"` dependencies
