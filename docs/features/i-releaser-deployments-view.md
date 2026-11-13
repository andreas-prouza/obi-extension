# i-Releaser deployments in the OBI view container

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | finished (Unreleased; tested against local HTTP servers, not yet against a real i-Releaser) | Discussion 2026-11-11: integrate i-Releaser more (workflows, start, status) | [i-releaser-deployment-status.md](i-releaser-deployment-status.md) |

Step 2 of 3:
1. [Status of the deployment](i-releaser-deployment-status.md) in the build summary, notifications (finished).
2. **This spec:** a tree view with the deployments of the project, their stages and steps. Read only.
3. [Actions](i-releaser-deployment-actions.md): run a stage, cancel a deployment, show the log of a step.


# Current situation

* The view `obi.deployment` is a webview ([I_Releaser.ts](../../src/webview/deployment/I_Releaser.ts), `deployment/i-releaser.html`, `javascript/i_releaser.ts`). It has been hidden since it was added (`when: 1==2`). It only lists workflows, a branch dropdown without data, and *Open in web*.
* To see the deployments of a project, the user opens i-Releaser in the browser.
* i-Releaser 3.1.0 has:
  * `GET /api/get_workflows`: workflow definitions, with `name` and `default_project`;
  * `GET /api/list_deployments/{project}`: newest first, `meta_file_id`, `version`, `status`, `workflow_name`, `commit`, `create_time`, `update_time`;
  * `POST /api/get_meta_file_json/{id}`: stages (`general.processed_stages` / `open_stages`), each with `actions[]` (the steps: `id`, `sequence`, `cmd`, `status`, `processing_step`, `run_history[]` with `id`, `status`, `create_time`).
  * Lists only contain what the token's user may read.


# Feature

## View

* `obi.deployment` becomes a native tree view (`type: tree`), name *i-Releaser*, collapsed by default.
* Shown when `obi.contains_obi_project && obi.valid-config && obi.i-releaser-configured`. The context key `obi.i-releaser-configured` is true when `deployment.toml` has an http(s) URL. It is set when the view is registered and whenever `deployment.toml` changes (`FILE_CALLBACKS`).
* The webview (`I_Releaser.ts`, its template, page script and `I_RELEASER_REQUESTS`) is removed.
* View title: *Refresh* (`obi.deployment.refresh`), *OBI: deployment config* and *OBI: open i-Releaser* (existing commands).

## Tree

```
erp                                      (only with several projects)
└─ 42 · Deploy OBI Build                 in process · build 2026-11-04 10:00:00
   ├─ START                              finished
   │  ├─ save objects                     finished
   │  └─ transfer                         finished
   ├─ TEST                               in process
   └─ PROD                               new
└─ 41 · Deploy OBI Build                 finished
└─ Show more…
```

* **Projects:**
  * the `project` of `deployment.toml`, if set;
  * otherwise the `default_project` of the configured workflows (`default-workflow` and `workflows`) that i-Releaser returns;
  * otherwise those of all workflows the token may read.
  * One project: its deployments are the root. Several: one node per project.
* **Deployment:**
  * label `<version> · <workflow>`, description: status, and `build <date time>` if a build in the local history has this deployment (`BuildEntry.deployment`);
  * icon by status, tooltip with workflow, status, id, created, updated and commit.
  * Pages of 20; *Show more…* loads the next 20.
* **Stage:** label name, description status, icon by status. Children: its steps.
* **Step:** label `processing_step` (otherwise the command, shortened to 60 characters), description status, tooltip with the full command.
* **Info items** instead of a list:
  * no token for the URL: "No i-Releaser token is stored for …", which opens the deployment config;
  * an error of i-Releaser: its message;
  * "No deployments".
* Item ids contain the deployment id, the stage id and the step id, so expanded nodes stay expanded after a refresh.

Status icons (`ThemeIcon`):

| Status | Icon |
|---|---|
| `finished` | `pass` (`testing.iconPassed`) |
| `failed` | `error` (`testing.iconFailed`) |
| `canceled` | `circle-slash` |
| `in process`, `in preperation`, `prepare` | `sync~spin` |
| `ready` | `play-circle` |
| other (`new`) | `circle-outline` |

## Data and live updates

* The list of a project is read when it is first shown and on *Refresh*. It stays cached until then.
* The stages of a deployment come from `DeploymentWatcher` while it watches the deployment. Otherwise they come from `get_meta_file_json`, cached until *Refresh*.
* Expanding a deployment that isn't `finished` or `canceled` watches it (new reason `view`). Collapsing it ends that. At most 5 deployments are watched for the view; expanding a sixth releases the one expanded first.
* A change reported by the watcher updates the deployment's node (status, description) and its stages.
* The view is read again on *Refresh*, when `deployment.toml` changes, when a token is stored, and when it becomes visible if the last read is older than 60 s.
* Requests run only in a trusted workspace (the URL comes from the workspace, and the token is sent there).

## Commands (item context menu)

| Command | Item | Does |
|---|---|---|
| `obi.deployment.refresh` | view title | reads everything again |
| `obi.deployment.open-in-browser` | deployment | opens `<url>/show_details/<id>` |
| `obi.deployment.open-build-summary` | deployment with a local build | `obi.open_build_summary` with the build's history folder |
| `obi.deployment.show-more` | *Show more…* | next page |

* The commands take the tree item only; ids that aren't in the tree are ignored and logged.
* Hidden in the Command Palette (`when: false`), except *Refresh*.


# Pure code (unit-tested, no `vscode` import)

`src/shared/IReleaser.ts`:

```ts
export interface WorkflowDefinition { name: string; default_project?: string }
export interface DeploymentSummary { id; version?; status; workflow?; commit?; create_time?; update_time? }
export interface StepState { id; sequence?; label: string; cmd: string; status: string; last_run?: number | string }
// StageState gets steps: StepState[]

export function get_workflow_definitions(base, token, signal?): Promise<WorkflowDefinition[]>   // get_workflows uses it
export function list_deployments(base, token, project, signal?): Promise<DeploymentSummary[]>
export function deployment_projects(definitions, config: { project?, 'default-workflow'?, workflows? }): string[]
```

The tree items are built in `src/webview/deployment/DeploymentsView.ts`.


## Result

* Files:
  * [DeploymentsView.ts](../../src/webview/deployment/DeploymentsView.ts): tree, commands, log documents (step 3);
  * [IReleaserDeployments.ts](../../src/shared/IReleaserDeployments.ts): new module for `list_deployments`, `deployment_projects` and the requests of step 3, so `IReleaser.ts` doesn't grow further. `get_workflow_definitions` and the steps of `parse_deployment` are in [IReleaser.ts](../../src/shared/IReleaser.ts).
* Deviations:
  * Step label: `processing_step`, otherwise the command. If both exist, the description is `<status> · <command, 40 characters>`, so steps of the same processing step can be told apart.
  * *Refresh* is also in the Command Palette (with a URL in `deployment.toml`).
  * A deployment the watcher reports that is newer than every listed one (started from the build summary or a custom template while the view was open) reads the lists again, once per id. Without this, the view showed it only after *Refresh*.
  * Removing the webview lowered the import-cycle baseline (`MODULES_IN_CYCLES` 16 → 15) and the lint baseline (251 → 249).
  * The integration tests use their own `DeploymentsView` instance and call `getChildren`/`getTreeItem` directly: the extension's bundle has registered the view and its commands. The context key is checked through `executeCommand`.
* Manual checks open: the view in a real VS Code against a real i-Releaser, several projects, live updates of an expanded deployment.


# Tests

* **Unit:** `list_deployments` (path with an encoded project, fields, broken entries), `get_workflow_definitions`, `deployment_projects` (project of the config; configured workflows; all; unknown workflows; duplicates), the steps in `parse_deployment` (order by `sequence`, label, last run).
* **Integration** (local i-Releaser):
  * one project: deployments as root, description with the local build; several projects: project nodes;
  * stages and steps of a deployment;
  * paging with *Show more…*;
  * no token: info item, no request; error answer: info item with the message;
  * expanding watches the deployment, collapsing ends it, at most 5;
  * context key with and without URL.


### Definition of done
* The view shows the deployments of the project with stages and steps, and follows running deployments.
* The webview `I_Releaser` is gone; `check:repo` passes (commands, l10n, `package.nls*`, no new import cycle).
* User docs ([building.md](../../asserts/docs/building.md#i-releaser-deployment)) and CHANGELOG.
