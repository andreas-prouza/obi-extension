# i-Releaser actions in the deployments view

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | finished (Unreleased; tested against local HTTP servers, not yet against a real i-Releaser) | Discussion 2026-11-11: integrate i-Releaser more (workflows, start, status) | [i-releaser-deployments-view.md](i-releaser-deployments-view.md) |

Step 3 of 3:
1. [Status of the deployment](i-releaser-deployment-status.md) in the build summary (finished).
2. [Deployments view](i-releaser-deployments-view.md) (read only).
3. **This spec:** run a stage, cancel a deployment, show the log of a step.


# Current situation

* The deployments view shows stages and steps, but to run the next stage or to see why a step failed, the user still opens i-Releaser in the browser.
* i-Releaser 3.1.0:
  * `POST /api/run_stage/{id}/{stage_id}/{continue|run_all}`: runs a stage in the background (permission `run` for this workflow and stage). Answer: `{"status": "success", "mode": "thread"|"service", "job_id"?, "service_running"?}`. `409` if the stage isn't `ready` or `failed`, or another stage of the deployment is running.
  * `POST /api/cancel_deployment/{id}`: permission `cancel workflow`. A stage that is already running is not stopped.
  * `GET /api/get_action_log/{run_id}`: one run of a step (`run_history[].id`): `status`, `create_time`, `stdout`, `stderr`.
* The server checks every permission. What OBI adds is the confirmation and an optional limit per project.


# Feature

## Run a stage

Context menu of a stage, only while the deployment isn't `finished` or `canceled`:

| Stage status | Commands |
|---|---|
| `ready` | **Run stage** (`continue`) |
| `failed` | **Continue stage** (`continue`: from the step that didn't finish), **Run stage again** (`run_all`: all steps) |

* Only for stages in `run-stages` of `deployment.toml`, if it is set:

  ```toml
  [i-releaser]
  # Stages that may be run from VS Code (case-insensitive); not set: all, as far as the token's user may
  run-stages = ["START", "TEST"]
  ```

  On the config page: one per line. Other stages get no run command, and a hint in their tooltip.
* A **modal** confirmation names the action, stage, deployment, workflow, version and URL:

  > Run stage TEST of deployment 123 (Deploy OBI Build, version 42)?
  > i-Releaser: https://ireleaser.example.com

* After the start:
  * `service_running: false`: warning "Stage TEST waits in the queue: the processing service of i-Releaser isn't running.";
  * otherwise information "Stage TEST of deployment 123 started.";
  * the deployment is watched (`started`), so its node follows the run and the notifications of [step 1](i-releaser-deployment-status.md) come.
* Errors (`409`, `403`, …) show i-Releaser's message.

## Cancel a deployment

* Context menu of a deployment that isn't `finished` or `canceled`: **Cancel deployment**.
* Modal confirmation: "Cancel deployment 123 (Deploy OBI Build, version 42)?", detail: "A stage that is already running is not stopped."
* Then the deployment is read again.

## Show the log of a step

* A step with at least one run: click, or **Show log** in the context menu. A failed stage: **Show log of the failed step** (its first failed step).
* Opens the latest run (highest `run_history[].id`) as a read-only document of the scheme `obi-i-releaser`:
  * `obi-i-releaser:/run/<run id>/<deployment id> <stage> <step>.log`;
  * the content provider reads `get_action_log/<run id>` from the URL of `deployment.toml`;
  * it only accepts a numeric run id. The URI never contains the URL or the token.
* Content: a header (deployment, stage, step, status, time, command), then `stdout` and `stderr`.

## Rules

* Trusted workspace only (`require_trust`).
* Only from the tree view: no new messages from webview pages, no command with free arguments. The commands take the tree item, find the deployment, stage and step by id in the tree, and ignore anything else (logged).
* One action per item at a time; a second click while it runs is ignored.
* Commands are hidden in the Command Palette.


# Pure code (unit-tested)

`src/shared/IReleaserDeployments.ts`:

```ts
export type StageOption = 'continue' | 'run_all';
export interface RunStageAnswer { mode?: string; job_id?: number | string; service_running?: boolean }
export interface ActionLog { status?: string; create_time?: string; stdout: string; stderr: string }

export function run_stage(base, token, id, stage_id, option, signal?): Promise<RunStageAnswer>
export function cancel_deployment(base, token, id, signal?): Promise<void>
export function get_action_log(base, token, run_id, signal?): Promise<ActionLog | undefined>   // undefined: {} of i-Releaser

export function stage_options(deployment_status: string, stage: StageState, run_stages: unknown): StageOption[]
export function may_run_stage(stage_name: string, run_stages: unknown): boolean
export function failed_step(stage: StageState): StepState | undefined
```


## Result

* Code in [DeploymentsView.ts](../../src/webview/deployment/DeploymentsView.ts) (commands, confirmation, log documents) and [IReleaserDeployments.ts](../../src/shared/IReleaserDeployments.ts) (requests, rules).
* Deviations:
  * `stage_options` takes the deployment's status, not the deployment.
  * The log text is put together in `DeploymentsView` (`format_log`), not in a pure `format_action_log`, because its labels go through `vscode.l10n`.
  * The header of a log (deployment, stage, step, command) is known while the window lives. A log document reopened after a reload shows the run and the log only.
  * Besides the context menu, *Run stage*, *Continue stage*, *Show log* and *Open in i-Releaser* are inline buttons on the item.
  * The commands check again what the context menu already limits: the item must come from the tree, the option must be one of `stage_options` (status, deployment not final, `run-stages`).
* Manual checks open: run, continue and cancel against a real i-Releaser (thread and service mode), permission errors (`403`), the log of a real step.


# Tests

* **Unit:** `run_stage` / `cancel_deployment` / `get_action_log` (method, path, header, answers, `{}`), `stage_options` (ready, failed, other status, final deployment, `run-stages`), `may_run_stage` (case, empty list), `format_action_log`.
* **Integration** (local i-Releaser):
  * run: confirmation, request, information, then the deployment is watched; declined: no request; `service_running: false`: warning;
  * not in `run-stages`: no run command for the stage (context value), and a call is refused;
  * cancel with confirmation;
  * log: document content from `get_action_log`, invalid URI refused;
  * untrusted workspace: nothing is sent.


### Definition of done
* Stages can be run and deployments canceled from the view, always after a modal confirmation, never beyond `run-stages`.
* Step logs open in VS Code.
* `check:repo`, l10n, `package.nls*`, user docs, CHANGELOG.
