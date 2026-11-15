# i-Releaser deployment as a card in the build summary

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟢 | finished (Unreleased; tested against local HTTP servers and in a page with the colours of the Dark Modern and Light Modern themes, not yet against a real i-Releaser) | User request 2026-11-15: the workflow area doesn't look modern | [i-releaser-deployment-status.md](i-releaser-deployment-status.md), [i-releaser-deployment-actions.md](i-releaser-deployment-actions.md) |


# Current situation

* The build summary shows the deployment in two lines of text: `i-Releaser deployment 80 · version 80: failed (updated …)` and `START finished → Create object list failed → …`.
* The statuses are spans with fixed background colours (`asserts/css/style.css`: `#c2ff90`, `#f96161`, …). They ignore the theme, the same as the statuses of the build list.
* Six stages with long names are one line that wraps anywhere.
* To react to a failed stage, the user goes to the i-Releaser view or the browser.


# Feature

## Card

* **Header:** rocket, *i-Releaser deployment 80*, workflow · version, status pill, *updated 06:36:56*, **Open in i-Releaser** (`<url>/show_details/<id>`, same id `i_releaser_deployment` as the link before; the link in the button row is only shown while there is no card).
* **Progress:** a 3 px bar, finished stages / all stages.
* **Stepper** (`<ol id="i_releaser_stages">`): per stage a circle (✓ finished, ✗ failed, turning sync icon while running, ▷ ready, ⊘ canceled, else its number), the name, the status. The line to a stage is green when the stage before it is finished.
  * Stages wrap (`flex: 1 0 130px`). `show_changes.ts` marks the first stage of each row (`ir-row-start`, again on resize), which gets no line.
* **Attention bar** (`#i_releaser_attention`) for the first failed stage, else the first ready stage; none for a ready stage of a finished or canceled deployment (`deployment_overview` in `IReleaserDeployments.ts`):
  * failed: *Stage {0} failed in step {1}.* (or *Stage {0} failed.*), **Show log** if the failed step has a run, **Continue** and **Run stage again** as `stage_options` allows;
  * ready: *Stage {0} is ready to run.*, **Run stage**;
  * runnable, but not in `run-stages`: no run buttons, the hint *Not in run-stages of .obi/etc/deployment.toml: run it in i-Releaser.*
* While nothing is read yet: *Loading the deployment status…* with a turning icon. Errors as before (`i-releaser-error`).

## Colours

* Only theme variables: `--vscode-testing-iconPassed` / `-iconFailed`, `--vscode-charts-blue` (running), `--vscode-textLink-foreground` (ready), `--vscode-descriptionForeground`, `--vscode-widget-border`, `--vscode-editorWidget-background`, the secondary button colours. Fallbacks for themes without them.
* `.status-pill`: tinted background and border (`color-mix`), text in the status colour. Also used for the status column of the build list (`status-pill <status>`, `in process` → `in_process`). The old classes `.success`, `.failed`, … stay for custom templates.
* The turning icons stop with `prefers-reduced-motion`.

## Actions

* Message `deployment_action` (`BuildSummaryMessages.ts`): `action` one of `show_log`, `continue`, `run_all`; `stage_id` `^[A-Za-z0-9_-]{1,64}$`. Nothing else comes from the page.
* `BuildSummary.deployment_action`: the deployment is the one the summary shows (`_shown_deployment`), the state the one of `DeploymentWatcher`; an unknown stage is ignored and logged. Only for the URL of `deployment.toml`.
* The actions are those of the i-Releaser view (`DeploymentsView.run_summary_stage`, `show_summary_log`): the same check of `stage_options` and `run-stages`, the same modal question, the same busy key per stage (`d|<id>|s|<stage id>`), so a stage can't be started twice from the view and the summary. Progress as a notification instead of in the view.
* `BuildSummary` gets them through `set_stage_actions` in `extension.ts`: importing the view would add an import cycle.
* `status_class` (`IReleaser.ts`) is replaced by `status_kind`.


# Tests

* **Unit** (`IReleaserDeployments.test.ts`): `status_kind`; `deployment_overview` (progress, failed before ready, failed step and log, `run-stages`, final deployments).
* **Integration** (`IReleaserDeployment.test.ts`, local i-Releaser):
  * the stepper (icons, numbers, green line), progress bar, status pill; no bar while a stage runs;
  * failed stage with step and three buttons, with `run-stages` only the log and the hint, ready stage with **Run stage**;
  * `deployment_action` calls the actions with the shown deployment; unknown stages and invalid messages do nothing.
