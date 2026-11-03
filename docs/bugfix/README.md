# Bugfix specs

Implementation specs for bugfixes. Features and refactorings are in [../features/](../features/). The complete index, with the source of every spec and a suggested order, is in [../improvements/README.md](../improvements/README.md#implementation-specs).

Each spec starts with a header table:

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🔴 / 🟠 / 🟡 | `Open` → `In progress` → `Done` | improvement entry | other specs |

followed by *Current situation*, *Fix*, *Tests* and *Definition of done*.

When a spec is done, set its status to `Done`, move it to `done/`, remove the improvement entry in [../improvements/](../improvements/), and add a CHANGELOG entry ([architecture.md → Updates](../architecture.md#updates)).
