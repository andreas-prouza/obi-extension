# Status of the i-Releaser deployment in VS Code

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | finished (Unreleased; tested against local HTTP servers, not yet against a real i-Releaser) | Discussion 2026-11-11: integrate i-Releaser more (workflows, start, status) | [i-releaser-deployment.md](i-releaser-deployment.md) |

Step 1 of 3. The later steps are not part of this spec:
2. [Deployments view](i-releaser-deployments-view.md) (`obi.deployment`, native tree view): deployments of the project with their stages.
3. [Actions](i-releaser-deployment-actions.md): run a stage (`continue` / `run_all`) with confirmation, show the log of a failed step, cancel a deployment.

Step 1 only reads from i-Releaser.


# Current situation

* The build summary starts an i-Releaser workflow and stores `{ id, workflow, project, deploy_version, started }` as `custom_data['i-releaser']` in the displayed build list ([i-releaser-deployment.md](i-releaser-deployment.md)).
* After the start, OBI doesn't look at the deployment again. To see whether a stage ran, or failed, the user opens i-Releaser in the browser.
* The record is only written to the displayed build list. Started from the current build, it is in `.obi/build-output/compile-list.json` but not in the copy in `.obi/build-history/<timestamp>/`, so the history and the Timeline don't know about the deployment.
* i-Releaser 3.1.0 (already the minimum) has everything needed ([webapi.md](https://github.com/andreas-prouza/i-releaser/blob/main/docs/webapi.md)):
  * `POST /api/get_meta_file_json/{id}`: the deployment: `general.status`, `general.processed_stages[]` and `general.open_stages[]` with `id`, `name`, `status`;
  * `GET /api/watch_state/{id}`: server-sent events. One `data:` event with a hash of the state when it changes (the first one right away), `: keep-alive` every 2 s, `data: {"status": "error", …}` on errors.
  * Deployment status: `new`, `ready`, `in process`, `failed`, `finished`, `canceled`. Stage status: `new`, `ready`, `prepare`, `in preperation`, `in process`, `failed`, `finished`.


# Feature

## Build summary

When the displayed build list has a deployment (`deployment_of`) and `deployment.toml` an i-Releaser URL, the area below the buttons shows:

> i-Releaser deployment 123 · version 42: `in process` (updated 10:41:07)<br>
> START `finished` → TEST `in process` → PROD `new`

* The stages are in their own line, in the order of their ids (the order i-Releaser created them), status with the colours of the build list (`finished` green, `failed`/`canceled` red, running blue, others grey).
* Before the first answer: "Loading the deployment status…". On an error: the message (never the token), and the line keeps the last known status.
* The status follows the deployment live while the build summary shows it.

## Watching a deployment (`DeploymentWatcher`)

* Watches a deployment for two reasons:
  * `summary`: the build summary shows it. It ends when the summary shows another build list or is closed.
  * `started`: it was started in this window. It lasts until the deployment is `finished` or `canceled`, so the notifications also come with the summary closed.
* Steps:
  1. Read the deployment (`get_meta_file_json`, 60 s timeout).
  2. If it isn't final, open `watch_state`. Each event reads the deployment again. No data for 30 s (the server sends a keep-alive every 2 s) means the connection is broken.
  3. Errors and closed streams: retry after 2 s, 5 s, 15 s, 30 s, then every 60 s. A successful read resets this.
* No token for the URL: no request; the summary shows "No i-Releaser token is stored for …".
* Only in a trusted workspace (the URL comes from the workspace, and the token is sent there).
* The token is sent in the header only, as in [i-releaser-deployment.md](i-releaser-deployment.md) (`Authorization: Bearer`, no redirects).

## Notifications

When a watched deployment changes (not on the first read):
* stage finished → information "i-Releaser deployment 123: stage TEST finished.";
* stage failed → error "i-Releaser deployment 123: stage TEST failed.";
* deployment canceled → warning.

Each with *Open*, which opens `<url>/show_details/<id>`.

## The deployment in the history and the Timeline

* Starting a workflow writes the record into every copy of the build: the live build list and its history folder (`history_dir_name(timestamp)`), if their `timestamp` is the one of the displayed list.
* `BuildEntry.deployment` (`HistoryIndex.read_build`, with `deployment_of`): the id of the deployment.
* Build history tree: a build with a deployment has the description `i-Releaser 123`.
* Timeline (workspace and folder items): description `… · i-Releaser 123`, tooltip line "i-Releaser deployment 123".
* No HTTP request for the history or the Timeline: they show the id, the build summary shows the status.


# Pure code (`src/shared/IReleaser.ts`, unit-tested)

```ts
export interface StageState { id: number | string; name: string; status: string }
export interface DeploymentState { id; status; project?; deploy_version?; workflow?; update_time?; stages: StageState[] }

export function parse_deployment(data: unknown): DeploymentState          // IReleaserError without general.id/status
export function get_deployment(base, token, id, signal?): Promise<DeploymentState>
export function is_final(state: DeploymentState): boolean                 // finished, canceled
export function state_changes(before, after): StateChange[]                // stage finished/failed, deployment canceled
export function status_class(status: string): 'success' | 'failed' | 'in_process' | 'new'
export class SseParser { push(chunk: string): string[] }                   // data of complete events, comments skipped
export function watch_state(base, token, id, on_change: () => Promise<boolean>, signal?, idle_ms = 30000): Promise<void>
```


## Result

* Files: [IReleaser.ts](../../src/shared/IReleaser.ts) (client, parser, no `vscode` import), [DeploymentWatcher.ts](../../src/webview/deployment/DeploymentWatcher.ts), [BuildSummary.ts](../../src/webview/show_changes/BuildSummary.ts) (`follow_deployment`, `deployment_status`, `store_deployment`), [HistoryIndex.ts](../../src/webview/build_history/HistoryIndex.ts), [BuildTimeline.ts](../../src/webview/timeline/BuildTimeline.ts).
* Deviations:
  * `DeploymentWatcher` gets the token store (`DeploymentConfig.get_auth_token` / `is_token_key`) at registration in `extension.ts`, instead of importing `DeploymentConfig`, which would add it to an import cycle.
  * Without a token, the watch stays (with the hint) while the summary shows the deployment. Storing a token (`secrets.onDidChange`) starts it again.
  * A finished or canceled deployment shown in the summary keeps its watch without any connection, so the page keeps showing its status.
  * The record is written with `DirTool.write_json`, not `OBITools.write_compile_list`, which replaced the build's `git` info with the current branch and commit.
  * The page is rendered again on each change (no new message type). The page keeps its scroll position and open sections.
* Not done: watches don't survive a window reload. After a reload, the build summary watches its deployment again when it is opened.


# Tests

* **Unit** ([IReleaser.test.ts](../../src/test/unit/IReleaser.test.ts)):
  * `parse_deployment`: stages of both lists ordered by id, workflow name, missing fields, no id;
  * `state_changes`, `is_final`, `status_class`;
  * `SseParser`: events split over chunks, `\r\n`, several `data:` lines, comments, too large without an event;
  * `get_deployment` against a local server: `POST`, path, header;
  * `watch_state`: `on_change` per event, `Accept: text/event-stream`, stops when `on_change` returns `false`, error event, idle timeout, HTTP error, abort.
* **Integration** ([IReleaserDeployment.test.ts](../../src/test/suite/IReleaserDeployment.test.ts)) with a local i-Releaser that serves `get_meta_file_json` and `watch_state`:
  * the summary shows the stages after the first read, and the change after an event;
  * notification for a failed stage, not for the first read;
  * no request without a token, the hint on the page;
  * start from the live list also writes the record into the history folder.
* **Unit** (`HistoryIndex`): `deployment` of a build.


### Definition of done
* The build summary shows the live status of its deployment; notifications for finished and failed stages.
* History tree and Timeline show which builds were deployed.
* The token is only sent to the URL it was stored for, in the header.
* `check:repo`, l10n, user docs ([building.md](../../asserts/docs/building.md#i-releaser-deployment)), CHANGELOG.
