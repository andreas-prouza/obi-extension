## [1.4.1]

**Requires VS Code 1.90 or newer** (before: 1.66).

**After updating:** run *Transfer all* once to remove personal files that older versions uploaded to the IBM i. Empty sources built with an older version show up as changed once. Custom build summary templates need `nonce="{{ global_stuff['nonce'] }}"` on inline scripts, and inline `on…=` handlers no longer work.

### Features
* **Live build output and cancel**: output panel **OBI Build** while a build runs; cancel from the notification or the view; command **OBI: Show build output**, setting `obi.build.revealOutput` ([spec](docs/features/remote-build-output-and-cancel.md))
* **Compile errors** of all built sources in the Problems view, in the right file (copybooks too) and column ([spec](docs/features/compile-diagnostics.md))
* **Status bar item**: profile, running operation, last build result, quick menu; setting `obi.statusBar.enabled` ([spec](docs/features/status-bar.md))
* **Build history clean-up**: settings `obi.buildHistory.maxBuilds` (100) and `obi.buildHistory.maxAgeDays`, size in the view title, *Delete entire build history*; asks once before deleting existing builds ([spec](docs/features/build-history-retention.md))
* **SSH login options**: keys with passphrase, `ssh-agent` (Pageant on Windows), `ssh-port`, `~`/`$HOME` in `ssh-key`, prompted passwords can be saved, clearer login errors ([spec](docs/features/ssh-authentication-options.md))
* **No window reloads** after *Initialize* or config changes; the OBI views update in place ([spec](docs/features/reload-free-config-changes.md))
* Webview panels keep their editor group, scroll position and opened sections ([spec](docs/features/webview-state-updates.md))
* **Walkthrough** under *Help → Get Started*, command **OBI: Initialize project in this folder** ([spec](docs/features/settings-walkthrough-keybindings.md))
* **Keybindings** `Ctrl+Alt+Shift+B` (build current source) and `Ctrl+Alt+Shift+C` (show its changes); setting `obi.build.confirmRun`
* **JSON schemas** for `dependency.json`, `source-infos.json`, source filters and `compile-list.json` ([spec](docs/features/json-schemas.md))
* Multi-root workspaces: OBI uses the first folder with an OBI project ([spec](docs/features/multi-root-workspace.md))
* The configuration pages say that saving drops comments in the TOML file ([spec](docs/features/toml-format-preserving-save.md))
* `max-parallel-builds` (*System settings*): sources of one level the OBI backend builds at the same time on IBM i. Needs the OBI backend from November 2026; default 1
* Extended source processing: a step can be a **Command** instead of a step (new column on the configuration page). It runs once, the default steps only with *Add default steps*, as in the OBI backend

### Security
* Remote commands are quoted correctly, and source names are validated; before, `;`, `$()` or spaces in paths and names reached the IBM i shell ([spec](docs/bugfix/remote-command-quoting.md))
* Deleting the remote project folder is guarded: no system folders, no home directory, confirmation with the absolute path ([spec](docs/bugfix/remote-delete-guard.md))
* Local OBI commands run without a shell ([spec](docs/features/command-injection-hardening.md))
* Webview messages are validated ([spec](docs/features/webview-message-protocol.md)); all webviews have a Content-Security-Policy ([spec](docs/features/webview-csp.md))
* SSH host keys are verified (fingerprint on first connect, `~/.ssh/known_hosts`, command **OBI: Forget stored SSH host key**) ([spec](docs/features/ssh-host-key-verification.md))
* OBI is disabled in untrusted and virtual workspaces ([spec](docs/features/workspace-trust.md))
* Secrets stay secret:
  * no `secret*` values in the log ([spec](docs/features/log-level-and-rotation.md)), the build history ([spec](docs/features/compile-list-size.md)) or the webview console ([spec](docs/features/replace-console-log-with-logger.md))
  * stored passwords and tokens are no longer sent to webviews ([spec](docs/bugfix/secrets-in-webview-html.md))
  * personal and generated files are no longer uploaded; the user config goes up with mode `600` ([spec](docs/bugfix/sensitive-files-upload.md))
  * new projects get a `.gitignore` for personal files ([spec](docs/features/project-template-gitignore.md))
* Log rotation (5 MB, 3 files), log level via *Developer: Set Log Level… → OBI*, settings `obi.log.writeFiles` and `obi.log.maxFileSizeMB`
* Source descriptions can't inject script ([spec](docs/bugfix/source-description-xss.md)); profile names are validated ([spec](docs/bugfix/profile-name-validation.md))

### Bugfixes
* Config files:
  * a fresh clone no longer rewrites `app-config.toml`; the schema version is in `.obi/etc/obi-project.json` (commit it) ([spec](docs/bugfix/config-migration-on-fresh-clone.md))
  * a save after a syntax error no longer wipes the file ([spec](docs/bugfix/config-overwrite-on-parse-error.md)); writes are atomic and failures reported ([spec](docs/bugfix/swallowed-write-errors.md))
  * new projects get valid `source-infos.json`, `dependency.json`, `object-builds.json` (bugs.md #18)
  * user config changes are picked up reliably ([spec](docs/features/config-cache-invalidation.md))
* Operations:
  * only one OBI operation runs at a time ([spec](docs/bugfix/operation-lock.md))
  * *Cancel* stops local OBI processes with their children; they also stop on reload ([spec](docs/bugfix/system-cmd-exit-handling.md))
  * Escape in a prompt no longer shows an error ([spec](docs/bugfix/input-cancel-shows-error.md)); a cancelled transfer stops the build
  * incomplete transfers are reported; a missing `compile-list.json` fails the build ([spec](docs/bugfix/partial-transfer-failures.md))
  * error messages name the cause, are shown once and offer *Show log* ([spec](docs/features/error-messages.md))
* SSH: keepalive every 60 s instead of 3.6 s ([spec](docs/bugfix/ssh-keepalive-interval.md)); `~` is the real home directory ([spec](docs/bugfix/remote-home-directory.md)); `ssh-concurrency` is used (bugs.md #12)
* Build list:
  * self-referencing variables no longer crash *Show changes* ([spec](docs/bugfix/self-referencing-variable.md)); unresolved placeholders are reported ([spec](docs/bugfix/unresolved-cmd-parameters.md))
  * `LIBL` as a string no longer adds one library per character (the Python OBI still has this bug in `get_set_libl_cmd`)
  * *Activate extended source processing* (`USE_ESP`) works (bugs.md #24)
  * stable source order within a level; empty sources no longer always shown as changed (bugs.md #15); `dependency.json` changes are picked up
  * same as the OBI backend: the settings of a source win over language settings and global variables (bugs.md #14); `TARGET_LIB_MAPPING` also maps an explicit `TARGET_LIB`; new variable `$(TARGET_LIB_ORIG)` (before the mapping)
  * extended source processing: `add_default_steps = false` and `allow_multiple_matches = false` were ignored
  * `ALWAYS_TRANSFER_RELATED_COPYBOOKS` is optional
* *Add source* without local OBI works like `add_source` of the OBI backend: the added source always gets new commands, dependents that were built keep their commands and output and are reset, related copybooks are added on level 0, and the levels of the whole list are calculated again
* Build history: builds without local OBI were missing, *Delete by date* around midnight, sort order ([spec](docs/bugfix/build-history-timestamps.md)); the delete button of a build shows, deleting asks first (bugs.md #3, #6)
* Source filters: *show empty folders*, invalid regular expressions, duplicates and the filter icon ([spec](docs/features/source-filter-tree-performance.md))
* Paths: Windows source names, `local-base-dir` everywhere ([spec](docs/bugfix/windows-source-path.md)); file links in remote workspaces, `cloud-ws-ssh-remote-host` no longer needed ([spec](docs/bugfix/remote-workspace-uris.md)); *Open file* and *Source quick search* open the right file
* Views: missing or broken files no longer break them ([spec](docs/bugfix/missing-files-break-views.md)); OBI Build view keeps its busy state ([spec](docs/bugfix/controller-view-retain-context.md)); native tree icons ([spec](docs/features/native-tree-icons.md))
* Configuration page: several save and tab errors fixed; the selected tab is no longer stored in the OS keychain ([spec](docs/bugfix/secret-storage-ui-state.md))
* Clean shutdown: SSH closed, all commands and listeners disposed ([spec](docs/bugfix/disposables-and-deactivate.md))
* Profile switch no longer rewrites unchanged `workspace-settings.json` ([spec](docs/features/file-watcher-debounce.md))
* Complete German texts ([spec](docs/features/localisation.md))
* Removed the never-working remote source check ([spec](docs/bugfix/old-sources-cleanup.md))

### Performance
* *Show changes* hashes each source at most once, with a cache ([spec](docs/features/source-hashing.md)); config read once per run ([spec](docs/features/build-list-config-caching.md)); build order on a dependency graph, cycles reported with their path ([spec](docs/features/dependency-graph.md))
* `compile-list.json` about 75 % smaller ([spec](docs/features/compile-list-size.md))
* Builds download only their own results, over one SFTP channel; build step timings in the log ([spec](docs/features/ssh-transfer-optimization.md))
* Config cached until a file changes ([spec](docs/features/config-cache-invalidation.md)); file watchers focused and debounced ([spec](docs/features/file-watcher-debounce.md)); source filter tree reads the sources once ([spec](docs/features/source-filter-tree-performance.md))
* OBI only starts in OBI workspaces ([spec](docs/features/activation-events.md))
* Package: about 120 files / 3 MB instead of 5,500 files / 20 MB ([spec](docs/features/vsix-package-size.md)); webview scripts 211 KB instead of about 2.3 MB ([spec](docs/features/webview-bundling.md))

### Development
* Tests: `npm test` works again ([spec](docs/bugfix/test-setup.md)), `npm run test:unit`, `npm run test:coverage` with thresholds ([spec](docs/features/test-coverage.md)), golden test for the build list, no-project check
* CI on Linux and Windows and with VS Code 1.90: type check, lint baseline (256), `check:repo`, tests, `npm audit`, VSIX size; Dependabot ([spec](docs/features/continuous-integration.md))
* TypeScript `strict` mode ([spec](docs/features/strict-typescript.md)); typed errors ([spec](docs/features/typed-error-handling.md)) and webview messages
* Module structure: `shared/` is pure, import cycles are counted ([spec](docs/features/module-structure.md)); commands via `register_command`
* Dependencies: front-end libraries from npm ([spec](docs/features/dependency-hygiene.md)), pinned versions ([spec](docs/features/pin-dependency-versions.md)), `wildcard-match` replaced by `minimatch`, unused packages removed
* Localisation via `vscode.l10n` ([spec](docs/features/localisation.md)); minimum VS Code 1.90 ([spec](docs/features/vscode-engine-bump.md))
* Dead code removed ([spec](docs/features/remove-dead-code.md)); `CONTRIBUTING.md`, package check table in `docs/technik.md` ([spec](docs/features/repository-hygiene.md))

## [1.3.3]

* Docu
* npm update


## [1.3.2]

* Add git info to compile-list


## [1.3.1]

### Build summary
* Add source
* Modify build command

### Build history
* Switch tree view: based on source or timestamp
* Search objects in builds


## [1.2.23]

* Update config when doing a rename. Also support renames in vscode explorer view
* Bugfix for Windows
* npm updates


## [1.2.22]

* Bugfix directory listener (Windows)
* npm updates


## [1.2.21]

* Remove property path for command list


## [1.2.20]

* Don't add variables starting with `secret` into the source properties
* Ignore if custom html template for build summary does not exist
* Build summary: `save_custom_data` can be called in custom html template to store individual data to compile list
* Add step properties if exist


## [1.2.19]

* Windows bugfix


## [1.2.18]

* Add source variables in compile list
* bugfix


## [1.2.17]

* Define individual global variables
* Support for individual webview integration
* bugfix


## [1.2.16]

* Add variables for compile commands


## [1.2.15]

* Add object compile level to `build-output/object-list.txt`


## [1.2.14]

* npm updates


## [1.2.13]

* npm updates


## [1.2.12]

* npm updates


## [1.2.11]

* Automatically focus source in source-filter
* npm updates
* remove unsecure npm packages


## [1.2.10]

* Bugfix
* npm updates


## [1.2.9]

* npm updates


## [1.2.8]

* Icon color
* Bugfixes
* npm updates


## [1.2.7]

* npm updates
* Bugfix in welcome view


## [1.2.6]

* Quick-search: check if source exist
* Add button in editor for run/show build
* npm updates


## [1.2.5]

* Toggle sources in build summary
* Several improvements
* Style
* Docu


## [1.2.4]

* toggle levels in build-list
* don't notify all missing json files


## [1.2.3]

* npm update
* workspace check on startup


## [1.2.2]

* Bugfixes
* Some improvements


## [1.2.1]

* Bugfix load dependency list


## [1.2.0]

* Maintain extended source processing config
* OBI is now watching several files
* Some restructures


## [1.1.0]

* Accept individual config parameters
* Show error, when json parse failed


## [1.0.4]

* Check dependency recursion


## [1.0.3]

* Add clear diagnostic button
* Bugfixes


## [1.0.2]

* Bugfixes


## [1.0.1]

* Bugfix for windows


## [1.0.0]

* Integration of EVFEVENT files
* Config enhancements. Added useable variables
* npm updates


## [0.6.20]

* npm updates


## [0.6.19]

* Compile output: use virtual files
* Bugfixes
* npm updates


## [0.6.18]

* Bugfixes
* npm updates
* Change view for individual settings


## [0.6.17]

* Bugfixes
* Quick search improved
* npm updates


## [0.6.16]

* npm update


## [0.6.15]

* New feature: Quick search
* Build history bugfixes (because of Windows filesystem)
* npm (securitiy) updates


## [0.6.14]

* Build history enhancements
* npm updates


## [0.6.13]

* Bugfix
* Design


## [0.6.12]

* Improve design in build summary (button, timestamp)
* Bugfix


## [0.6.11]

* Win bugfix


## [0.6.10]

* Add build history


## [0.6.9]

* Support for special characters in ADDLIBLE command (liblist -a)


## [0.6.8]

* Add constant attribute
* Replace constant.py after extension update


## [0.6.7]

* Config
  * keep not yes supported attributes
  * New option to transfer always copybooks
* npm update


## [0.6.6]

* Bugfix


## [0.6.5]

* Use same icons for dark and light mode


## [0.6.4]

* npm update


## [0.6.3]

* Performance improvements
* Docu
* Bugfixes
* GUI


## [0.6.2]

* Delete/copy profiles


## [0.6.1]

* Introduce config profiles
* Keep state of webviews getting to background
* Activation of source extended processing
* npm update


## [0.5.5]

* Now you can set single cmds to get ignored
* npm update


## [0.5.4]

* Bugfix
* npm update


## [0.5.3]

* Another windows path cleanup


## [0.5.2]

* Add docu


## [0.5.1]

* Generate build list without OBI python client
* Build summary design
* Bugfixes


## [0.4.22]

* Bugfixes


## [0.4.21]

* Bugfixes


## [0.4.20]

* Automatically refresh environment on changes


## [0.4.19]

* Bugfixes with Windows path


## [0.4.16]

* Bugfixes with Windows path


## [0.4.15]

* Some improvements


## [0.4.14]

* Update obi config template


## [0.4.13]

* Bugfixes


## [0.4.12]

* Update OBI backend


## [0.4.11]

* npm updates


## [0.4.10]

* Copy dummy source on init
* Bugfix


## [0.4.9]

* List not supported file extensions
* Keep source descriptions after rename
* Bugfixes


## [0.4.8]

* Bugfix: Reset object list


## [0.4.7]

* Added tooltips in configurations
* Automatically open config if not valid/completed
* Bugfix: Windows path


## [0.4.6]

* Redeploy because of errors in MS Marketplace


## [0.4.5]

* Refresh source list in background


## [0.4.4]

* Bugfix: Windows FS


## [0.4.3]

* New context menu for sources (rename, delete)


## [0.4.2]

* Bugfix when using it under Windows OS
* Improve performance for source drop down in dependency maintainance


## [0.4.1]

* Add dependency maintainance
* Add alerts for changes (e.g. save) in webview
* Now you can also add new source members


## [0.3.34]

* Add save notification


## [0.3.33]

* Difference between Windows and other OS


## [0.3.32]

* Support special characters in source name


## [0.3.31]

* Fix SSH NPM problems


## [0.3.30]

* Change package creation (without dev stuff)


## [0.3.29]

* Add maintain of source description in source filters
* Add function to create new source in source filters
* Update npm


## [0.3.28]

* Add list type in source config


## [0.3.27]

* npm update
* Remove test folder from ssh2 package


## [0.3.26]

* Prints error message from OBI
* npm update


## [0.3.25]

* more checks after extension update
* npm update


## [0.3.24]

* Also transfer `logger_config.py`
* npm update


## [0.3.23]

* Added support for `~` and `$USER` in path
* Generate `~/.bashrc` if missing


## [0.3.22]

* Change `~` to `/home/$USER` for compatibility


## [0.3.21]

* Create home directory if missing
* Use bash if not set
* npm update


## [0.3.20]

* npm update


## [0.3.19]

* Scipt support in ESP
  

## [0.3.17]

* npm update


## [0.3.16]

* Added TARGET_LIB in config panel


## [0.3.15]

* npm update


## [0.3.14]

* Log output if local OBI failed
* Now you can just transfer a minimum setup to remote IBM i, when if remote IFS directory doesn't exist yet


## [0.3.13]

* Bugfix when save config


## [0.3.12]

* Remove support for Theia due to security vulnerbilities


## [0.3.11]

* New button to cancel process "show changes" or "run build"
* Support system env variables in path


## [0.3.10]

* npm update


## [0.3.9]

* Changed error handling for choosing Root in a configs path


## [0.3.8]

* npm update


## [0.3.7]

* Improve style in summary list


## [0.3.6]

* Maintain of source infos will be saved automatically
* Fixed problem with bootstrap tables


## [0.3.5]

* Bugfixes
* Improvements


## [0.3.4]

* Separate source view


## [0.3.3]

* Changed default config for new projects
* Source filter config: Now you can choose to use regex or not


## [0.3.2]

* Bugfix if no workspace available


## [0.3.1]

* SQL target lib replacement (`$(SOURCE_FILE_NAME)`)
* Documentation in config menu


## [0.3.0]

* Finalize source maintenance


## [0.2.26]

* Bugfixes
* Extend compile-list
* Skip update to compiled object list on IBM i (performance)
* Download of compiled object list not necessary anymore


## [0.2.25]

* Bugfixes
* Support for individual source config (Beta)


## [0.2.24]

* Rerun build button in summary


## [0.2.23]

* Bugfixes


## [0.2.22]

* Better maintain of compile commands
* Remember config window position
* Bugfixes
* Remove uneccessary icons in controller view
* NPM fixes

## [0.2.21]

* On object list reset: transfer it also to IBM i
* Checks for duplicate processing


## [0.2.20]

* Clean up logs on IBM i


## [0.2.19]

* Change object list from TOML to JSON due to performance issues


## [0.2.18]

* Improve logging
* Buttons for single source processing


## [0.2.17]

* Windows bugfix


## [0.2.16]

* Run build & show changes for a single source
* Bugfixes
* NPM updates


## [0.2.15]

### Bugfix

* Windows file system


## [0.2.14]

### Added

* Support for remote workspaces


## [0.2.13]

### Changed

* Improved source filters


## [0.2.12]

### Changed

* Improved json structure of source infos


## [0.2.10]

### Changed

* Bugfix in self check


## [0.2.9]

### Added

* Self check
* Creation support for further SQL objects
  
### Changed

* Better support for local OBI if exist
* Optimized some SSH commands


## [0.2.8]

### Changed

* Relative log path


## [0.2.7]

### Added

* Rename of feature `source-list` to `source-filter`


## [0.2.6]

### Added

* English support for code-oss


## [0.2.5]

### Added

* Multilanguage support


## [0.2.4]

* Updated some NPM packages


## [0.2.3]

### Changed
* Find funktion in logs
* Maintain source infos (description text)


## [0.2.2]

### Changed
* Improve performance


## [0.2.1]

### Added
* Delete button for source list filters


## [0.2.0]

### Added
* Config for source list filters

### Changed
* Extend documentation


## [0.1.8]

- Initial release
