# Branch-based development

- **Status:** ready. The extension's part is specified and implemented in [obi-extension-branch-build-spec.md](obi-extension-branch-build-spec.md) (all but U3).
- **Type:** concept
- **Backend:** OBI version 6. User docs: `obi/docs/branch-build.md`, backend spec: `obi/docs/features/branch-build.md`

Developers working on different tickets must not affect each other's builds. Today everybody builds into the same libraries, whatever git branch they are on: a build on one feature branch overwrites the objects of another, and the libraries don't show the state of `main`.


## Concept

- **Branch with a ticket number:** every build goes into libraries of that ticket, named `#{ENV}_{TICKET}` by default. ENV is the tenant group of the production library, so one branch library takes the objects of several production libraries (e.g. `aaobj` and `aadta` → `#AA_337`).
- **`main`, and branches without a ticket number:** builds use the main libraries, as before. They always hold the state of `main`, and every branch tests on top of that state.
- **Deployment:** only from `main`, after the merge, and only from build package builds.
- **Optional:** the feature is active only when the OBI config (`app-config.toml` merged with the user config) has a `[branch-build]` section that doesn't set `enabled = false`. Without it, OBI and the extension behave as before, also without git and without a deployment config.


## Example

```toml
[branch-build]
ticket-pattern = '(?i)\bproj[-_](\d+)'     # Python regex, group 1 = ticket. Literal string: "\b" is rejected
lib-name = "#$(ENV)_$(TICKET)"

[branch-build.env]                          # production library -> ENV
aaobj = "AA"
aadta = "AA"
bbobj = "BB"
```

| Branch | Ticket | Builds into |
|---|---|---|
| `PROJ-337-order-rework`, `proj_337_fix` | 337 | `#aa_337`, `#bb_337` |
| `main`, `dev-setup`, a detached HEAD | – | the main libraries |

- The branch library names have to fit 10 characters: `#` + ENV + `_` + ticket. OBI rejects longer names.
- In a branch build, the branch libraries of every ENV in the library list go on top, the target library topmost. Branch libraries that don't exist yet are skipped.


## Decisions

| Topic | Decision |
|---|---|
| Who knows ticket and libraries | Only the backend. The ticket pattern is a Python regex; the extension passes the branch (`--branch`) and shows what the backend wrote into `build_context` |
| What a build compiles | A build package or single sources, on branches and on `main`. Build hashes (`object-builds.json`) are shared between branches and aren't part of the process; to rebuild everything, run the package again |
| Incomplete `[branch-build]` | An error. OBI never falls back to the main libraries: whoever configured branch builds expects the build to be isolated |
| No git or detached HEAD | Main libraries, with a warning |
| Tables and PFs in a branch library | Created empty |
| Removing branch libraries | Manually, with the command *OBI: Branch libraries*. `DLTLIB` can't be undone, and a ticket sometimes needs fixes after deployment |
| Deployment guard | In the extension (`main-branch` in `deployment.toml`, package build, build context `main`). The deployment tool should check the same again, as a second line of defence against old extensions and direct API calls |


## Workflow

1. Create a branch named after the ticket, e.g. `PROJ-337-order-rework`.
2. Create the build package of the branch (the extension offers it) and build it into the branch libraries; while iterating, build single sources.
3. Test with `ADDLIBLE #aa_337` (the build summary lists the commands).
4. Before the PR, check the package against the changes of the branch (*Add sources changed on this branch*).
5. PR and merge; the build package goes along.
6. On `main`, build the same package into the main libraries, test, and deploy that build.
7. Delete the branch libraries and archive the build package.

"Run build" for changed sources still exists, but isn't part of the process: its builds can't be deployed.


## Setup notes

- Every developer needs their own `remote-base-dir` (in the user configuration). With a shared SSH user, two developers would otherwise upload into the same folder on IBM i.
- Commit the build packages (`.obi/build-packages/<branch>.json`) on the branch, so they reach `main` with the merge.
- Roll out the extension and the remote OBI (version 6) first, then activate `[branch-build]`.
- The main libraries may still contain builds of branches that were never merged. Rebuild the affected objects from `main` once, or accept the difference until their next build.


## Risks

1. **Incomplete package:** a source changed on the branch but missing from the package isn't built on the branch, isn't built on `main` and isn't deployed, although it is merged. The package check of the extension finds it; a PR check in CI can do the same for changes made without the extension.
2. **Library list order:** check once in a build joblog that the branch libraries are on top.
3. **Shared binding directory:** a service program that only exists in a branch library may end up in a binding directory that everybody uses. If that breaks other builds, use a binding directory per branch (`[branch-build.settings]`, created by `crt-branch-lib`).
4. **Authority:** a branch library belongs to the user who built it. A second developer on the same ticket needs the authority to replace its objects.
5. **Qualified names** in sources (`MYDTA.X`, `MYLIB/PGM`) ignore the library list and don't point to the branch libraries.
6. **Service programs:** a program in a branch library binds to the first matching service program in the library list. A later rebuild in the main library isn't picked up.
7. **Data:** programs on a branch see the empty tables of the branch library on top of the main data libraries.
