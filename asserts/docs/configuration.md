[← Back to README](../../README.md)

# Configuration

- [Opening the configuration](#opening-the-configuration)
- [Project and user configuration](#project-and-user-configuration)
- [Files in the .obi folder](#files-in-the-obi-folder)
- [Connection](#connection)
- [General settings](#general-settings)
- [Compile settings](#compile-settings)
- [Target library](#target-library)
- [Commands and steps](#commands-and-steps)
- [Variables](#variables)
- [Profiles](#profiles)
- [Per-source build settings](#per-source-build-settings)
- [Extended source processing](#extended-source-processing)
- [Custom build summary template](#custom-build-summary-template)
- [Language](#language)

OBI has no VS Code settings. Everything is stored in the project folder under `.obi`.


## Opening the configuration

⚙ **Configuration** in the toolbar of the OBI Build view.

![Configuration](../img/ext/config-minimum.png)

The configuration has three areas, each with several tabs:

| Area | File |
|---|---|
| **Project configuration** | `.obi/etc/app-config.toml` |
| **User configuration** | `.obi/etc/.user-app-config.toml` (or the file of the active [profile](#profiles)) |
| **Source configuration** | `.obi/etc/source-config.toml` (see [Per-source build settings](#per-source-build-settings)) |

Tabs: **Configuration** (connection, paths, OBI backend), **Compile settings** (settings, variables, commands, steps), **Extended compile**, **System settings** (object types, encodings, threads) and **Constants** (file locations).

You can also edit the TOML files directly (links *Open project config file* / *Open user config file*). When a configuration file changes, the window reloads.


## Project and user configuration

* The **project configuration** holds everything the team shares. Commit it.
* The **user configuration** holds personal settings: SSH user, key, password, your own target library, ...
  It has the same structure, and every value set there **overrides** the project configuration.
  Empty values do not override.

On each build, the project configuration and your active user configuration are uploaded to IBM i, so the OBI backend uses the same settings.


## Files in the .obi folder

| File / folder | Content | Git |
|---|---|---|
| `etc/app-config.toml` | Project configuration | ✅ commit |
| `etc/.user-app-config.toml`, `etc/.user-app-config-<profile>.toml` | User configuration per [profile](#profiles) | ❌ local |
| `etc/workspace-settings.json` | Active profile | ❌ local |
| `etc/source-config.toml` | [Per-source build settings](#per-source-build-settings) | ✅ commit |
| `etc/extended-source-processing-config.toml` | [Extended source processing](#extended-source-processing), project | ✅ commit |
| `etc/.user-extended-source-processing-config*.toml` | Extended source processing, user/profile | ❌ local |
| `etc/dependency.json` | [Dependencies](dependencies.md) | ✅ commit |
| `etc/source-infos.json` | [Source descriptions](sources.md#source-descriptions) | ✅ commit |
| `etc/object-builds.json` | Hashes of the last successful builds (change detection) | ❌ local, usually (it reflects what *you* built) |
| `etc/constants.py`, `etc/logger_config.py` | Settings for the OBI backend; do not modify | ✅ commit |
| `etc/source-list-local.json`, `etc/source-list-remote.json` | Generated source lists | ❌ local |
| `source-list/*.json` | [Source filters](sources.md#source-filters) | ✅ commit |
| `.vscode/templates/` | [Custom build summary template](#custom-build-summary-template) | ✅ commit |
| `build-output/` | Current build list and results | ❌ local |
| `build-history/` | [Build history](building.md#build-history) | ❌ local |
| `tmp/`, `log/` | Temporary files, compiler events, logs | ❌ local |

Suggested `.gitignore`:

```gitignore
.obi/etc/.user-*
.obi/etc/workspace-settings.json
.obi/etc/object-builds.json
.obi/etc/source-list-*.json
.obi/build-output/
.obi/build-history/
.obi/tmp/
.obi/log/
```


## Connection

Section `[connection]`.

| Key | Mandatory | Description |
|---|---|---|
| `remote-host` | ✅ | IBM i host name or IP |
| `ssh-user` | ✅ (user config) | IBM i user profile |
| `ssh-key` | | Absolute path to your private SSH key. `~` is not expanded |

**Password**: entered in the user configuration, but stored in VS Code's secret storage (per profile, host and user), never in a file.
Without key and stored password you are prompted when connecting. See [SSH setup](ssh.md).


## General settings

Section `[general]`. The defaults created by *Initialize* work for most projects.

| Key | Mandatory | Default | Description |
|---|---|---|---|
| `local-base-dir` | ✅ | `.` | Project folder on the PC (relative to the workspace) |
| `remote-base-dir` | ✅ | | Project folder in the IFS. Relative paths start at the home directory. `${workspaceFolderBasename}`, `~` and `$USER` are replaced |
| `source-dir` | ✅ | `src` | Source directory below the project folder |
| `remote-obi-dir` | ✅ | | Path of the [OBI backend](https://github.com/andreas-prouza/obi) on IBM i |
| `local-obi-dir` | | | Optional path of a local OBI backend (with `venv`); used to generate the build list instead of the extension |
| `supported-object-types` | ✅ | `pgm, file, srvpgm, module, cpy, obj` | Last file extension of sources OBI handles |
| `file-system-encoding` | ✅ | `utf-8` | Used by the OBI backend |
| `console-output-encoding` | ✅ | `utf-8` | Used by the OBI backend |
| `max-threads` | ✅ | `20` | Parallel threads for hashing sources |
| `check-remote-source-on-startup` | | `false` | Compare local and remote sources on startup and offer to sync them |
| `evfevent-output-dir` | ✅ | `.obi/tmp/evfevent` | Where compile commands write compiler events |
| `cloud-ws-ssh-remote-host` | | | Only for remote/cloud workspaces: host of the workspace (not the IBM i) |
| `compiled-object-list`, `source-list`, `remote-source-list`, `source-infos`, `dependency-list`, `deployment-object-list`, `build-output-dir`, `compile-list`, `compiled-object-list-md` | ✅ | see [files](#files-in-the-obi-folder) | File locations (tab *Constants*) |

None of the base or OBI paths may be `/`.

Mandatory values that are missing are reported when the project opens, and the configuration is opened.


## Compile settings

Section `[global.settings.general]`: default parameters for all compile commands, available as [variables](#variables).

| Key | Mandatory | Example | Description |
|---|---|---|---|
| `TGTRLS` | ✅ | `*CURRENT` | |
| `DBGVIEW` | ✅ | `*ALL` | |
| `TGTCCSID` | ✅ | `*JOB` | |
| `STGMDL` | ✅ | `*SNGLVL` | |
| `LIBL` | ✅ | `["$(TARGET_LIB)", "QGPL"]` | Library list for the build. Each entry is added with the command `global.cmds.add-lible` → `$(SET_LIBL)` |
| `ACTGRP` | | `*CALLER` | |
| `INCLUDE_BNDDIR` | | | Binding directory |
| `INCDIR_RPGLE`, `INCDIR_SQLRPGLE` | | `'./src'` | Include directories |
| `RPGPPOPT` | | `*LVL2` | |
| `TARGET_LIB` | | | See [Target library](#target-library) |
| `TARGET_LIB_MAPPING` | | | See [Target library](#target-library) |
| `ALWAYS_TRANSFER_RELATED_COPYBOOKS` | | `false` | See [Copybooks](dependencies.md#copybooks) |

Parameters such as `ACTGRP(...)`, `BNDDIR(...)`, `TGTRLS(...)`, `STGMDL(...)`, `TGTCCSID(...)`, `DBGVIEW(...)` or `INCDIR(...)` are removed from a command if their value is empty.

**Language settings** override these values per source type (*Individual language settings*):

```toml
[global.settings.language."sqlrpgle.pgm"]
RPGPPOPT = "*LVL2"
DBGVIEW = "*SOURCE"
```

![Language settings](../img/ext/config-compile.png)


## Target library

`$(TARGET_LIB)` is determined for each source:

1. `TARGET_LIB = "*SOURCE"` → the library folder of the source
2. `TARGET_LIB = "MYLIB"` → that library
3. `TARGET_LIB` empty → the entry for the source's library in `TARGET_LIB_MAPPING`
4. otherwise → the library folder of the source

Typical setup: no `TARGET_LIB` in the project configuration, and each developer sets their own test library in the user configuration.

```toml
[global.settings.general.TARGET_LIB_MAPPING]
prodlib = "devlib"
```


## Commands and steps

Build commands are shell commands executed in PASE (bash) in the remote project folder. IBM i commands are run with `cl -v "..."`.

| Section | Content |
|---|---|
| `[global.cmds]` | General, reusable commands, e.g. `add-lible`, `chg-src-ccsid`, `evfevent-export` |
| `[global.compile-cmds]` | Compile commands, e.g. `"rpgle.pgm"`, `srvpgm-crt` |
| `[global.steps]` | Which commands run for which source type, in order |

```toml
[global.steps]
"rpgle.pgm"    = [ "global.cmds.chg-src-ccsid", "global.compile-cmds.\"rpgle.pgm\"" ]
"rpgle.srvpgm" = [ "global.cmds.chg-src-ccsid", "global.compile-cmds.\"rpgle.mod\"",
                   "global.compile-cmds.bnddir-rmv", "global.compile-cmds.srvpgm-crt", "global.compile-cmds.bnddir-add" ]
```

* The step key is matched against the end of the source name (`order.rpgle.pgm` → `rpgle.pgm`); as fallback the last extension (`pgm`) is used.
* Steps under `"*ALL"` run first for every source.
* A step references a command by its path. Keys containing dots must be quoted: `global.compile-cmds."rpgle.pgm"`.
* Inside a command, `%global.cmds.xyz%` inserts another command.
* If `global.cmds.dspjoblog` is defined, it is appended to every step (with `$(joblog-separator)` replaced by `global.cmds.joblog-separator`).

The default configuration contains commands and steps for RPG, SQLRPGLE, CL, DDS (PF, DSPF, PRTF), SQL tables, views, indexes, procedures and functions, and service programs.


## Variables

Use `$(NAME)` in commands. Variables are resolved recursively.

**Built-in variables**

| Variable | Value (for `src/mylib/qrpglesrc/order.rpgle.pgm`) |
|---|---|
| `$(SOURCE)` | `mylib/qrpglesrc/order.rpgle.pgm` (relative to the source directory) |
| `$(SOURCE_FILE_NAME)` | `src/mylib/qrpglesrc/order.rpgle.pgm` (relative to the project folder) |
| `$(SOURCE_BASE_FILE_NAME)` | `order.rpgle.pgm` |
| `$(OBJ_NAME)` | `order` |
| `$(SRC_ATTR)` | `rpgle` |
| `$(SRC_TYPE)` | `pgm` |
| `$(TARGET_LIB)` | see [Target library](#target-library) |
| `$(SET_LIBL)` | commands to set the library list from `LIBL` |

Also available: all [compile settings](#compile-settings) (`$(TGTRLS)`, `$(ACTGRP)`, ...), all [general settings](#general-settings) (e.g. `$(evfevent-output-dir)`) and all commands of `[global.cmds]` (`$(global.cmds.evfevent-export)`).

In SQL sources, write `$(SQL_TARGET_LIB)` where the target library belongs. The command `global.cmds.sql-set-target-lib` replaces it with the target library before running the SQL.

**Your own variables** (*Global variables* in the compile settings):

```toml
[global.variables]
MY_OPTION = "*YES"
```

Variables whose names start with `secret` are not substituted and are not written into the build list.
They are still uploaded to IBM i with the configuration, and the build history stores a copy of the configuration, so they are not a secure place for credentials.

**Precedence** (lowest to highest): compile settings → per-source settings → language settings → general settings → global variables.


## Profiles

A profile is a separate user configuration, e.g. to build into a different library or with a different user.

* Files: `.obi/etc/.user-app-config.toml` (default profile) and `.obi/etc/.user-app-config-<name>.toml`
* Select the profile in **Using profile** in the OBI Build view.
* ➕ copies the current profile into a new one and activates it.
* 🗑 deletes the current profile and switches back to the default one.

Per profile: all user settings, the stored SSH password and the user's extended source processing rules.


## Per-source build settings

For single sources you can override settings, define own commands and replace the steps:

* **OBI: Individual build settings** on a source (Source filters tree, explorer or editor tab context menu)
* or the **Source configuration** area of the configuration

Stored in `.obi/etc/source-config.toml`, keyed by the source path relative to `src`:

```toml
["mylib/qrpglesrc/order.rpgle.pgm"]
settings = { ACTGRP = "ORDER", TARGET_LIB = "TESTLIB" }
source-cmds = { my-cmd = "cl -v \"CALL MYLIB/PREPARE\"" }
steps = [ "global.cmds.chg-src-ccsid", "source-cmds.my-cmd", "global.compile-cmds.\"rpgle.pgm\"" ]
```

* `settings` override the [compile settings](#compile-settings) for this source.
* `source-cmds` are commands only available for this source (`source-cmds.<id>`).
* `steps`, if not empty, **replace** all steps for this source (including `*ALL`).


## Extended source processing

The tab **Extended compile** (`extended-source-processing-config.toml` and the user variant) defines rules that select build steps and properties for groups of sources (e.g. by source name pattern) instead of single sources.
For now, prefer [steps per source type](#commands-and-steps) and [per-source build settings](#per-source-build-settings).


## Custom build summary template

Add your own HTML to the [build summary](building.md#build-summary) by creating:

```
.obi/.vscode/templates/custom_build_list_template.html
```

It is included as a [Nunjucks](https://mozilla.github.io/nunjucks/) template and has access to, among others, `compile_list`, `app_config`, `compile_app_config` (configuration of the displayed build) and `is_compile_list_completed`.

To store data in the build list (and therefore in the build history), send it to the extension:

```html
<input id="ticket" placeholder="Ticket" value="{{ compile_list.custom_data.ticket or '' }}">
<button id="save_ticket">Save</button>
<script>
  document.getElementById('save_ticket').addEventListener('click', () => {
    window.vscode.postMessage({
      command: 'save_custom_data',
      type: 'ticket',
      data: document.getElementById('ticket').value
    });
  });
</script>
```

The data is stored as `custom_data.<type>` in `compile-list.json`.


## Language

The UI is available in English and German and follows VS Code's display language.
