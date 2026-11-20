# i-Releaser: stages which wait for parallel stages

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟢 | finished (Unreleased; tested with unit and integration tests against a local HTTP server, not against a real i-Releaser) | User request 2026-11-19, after the fix in i-Releaser (`docs/bugfixes/merging-stage-ready-too-early.md` there) | [i-releaser-status-card.md](i-releaser-status-card.md), [i-releaser-deployments-view.md](i-releaser-deployments-view.md) |


# Current situation

A stage with `after_stages_finished` (e.g. `STAGE 3` after `STAGE 2.1` and `STAGE 2.2`) can only run when these stages are finished.

* i-Releaser set it `ready` as soon as the first of them was finished. The card said *Stage STAGE 3 is ready to run.* with **Run stage**, the i-Releaser view offered **Run stage**; i-Releaser refused the run ("still waiting for other stages").
* i-Releaser now keeps it `new` until then, and sends `waiting_for`: the names of the stages it still waits for. Without this, a `new` stage looks like one that isn't reached yet.


# Feature

* `StageState.waiting_for` (`IReleaser.ts`): the names of `waiting_for` of the stage; not set if the list is empty, missing (older i-Releaser) or not a list.
* `is_waiting(stage)` (`IReleaserDeployments.ts`). A waiting stage has no `stage_options`, also if i-Releaser reports it `ready` (deployments of an i-Releaser before the fix). `deployment_overview` doesn't take it as the stage which is ready to run.
* **Card:** the status of the stage is *waits for STAGE 2.1* (several: separated by commas).
* **i-Releaser view:** the description of the stage is *waits for STAGE 2.1*, the tooltip has it as second line.
* Text `waits for {0}` (German *wartet auf {0}*).


# Tests

* **Unit** (`IReleaserDeployments.test.ts`): `waiting_for` parsed, invalid entries left out, no field without a list; `stage_options` of a waiting `ready` stage; `deployment_overview` takes the other ready stage, and none while that one runs.
* **Integration** (`IReleaserDeployment.test.ts`, local i-Releaser): the card shows *waits for B* for the merging stage and *Stage B is ready to run.* with **Run stage** for B; a merging stage reported `ready` too early has no bar and no buttons.
