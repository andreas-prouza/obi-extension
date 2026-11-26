# Build summary: status changes of the deployment update only its card

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Performance | 🟠 | finished (integration test in IReleaserDeployment.test.ts; the page script part is not covered by a test) | [improvements v2.2.3 D2](../improvements/v2.2.3/README.md) | – |


# Current situation

`DeploymentWatcher.on_changed` called `BuildSummary.update()` for every status event of the shown i-Releaser deployment (server-sent events while a deployment runs). `update()` reads the build list again, renders the whole Nunjucks template and replaces `webview.html`: the webview parses the whole page again and runs its scripts, for every event, also with a large build list.


# New feature

* The deployment card is a template of its own, [deployment_card.html](../../asserts/templates/show_changes/deployment_card.html), included by the page.
* `BuildSummary.update_deployment()` ([BuildSummary.ts](../../src/webview/show_changes/BuildSummary.ts)) is called for status events instead of `update()`. It builds the card from `_shown_deployment` and `DeploymentWatcher` (no build list read), renders only the card template and sends it as `{ command: 'deployment_card', html }`.
  * If the card appears or disappears (`deployment.watched` differs from the last full page, `_card_shown`), the whole page is rendered: the header link of an unwatched deployment changes then.
* Page script ([show_changes.ts](../../src/webview/show_changes/javascript/show_changes.ts)): replaces `#i_releaser_status` with the received card. The buttons of the card (show log, continue, run stage) are handled by one listener on the document, so a replaced card needs no new listeners. One `ResizeObserver` for the stage rows, moved to the new list.
* Safety: the card is rendered by the extension with autoescape, as the whole page before; it contains no scripts, and the CSP is unchanged.

All other updates (build finished, checkboxes, add source, edit command, start deployment, another build) still render the whole page.


# Tests

Integration ([IReleaserDeployment.test.ts](../../src/test/suite/IReleaserDeployment.test.ts)), with a panel that records full pages and messages:

* After the first full page, a new status (stage failed) gives a `deployment_card` message with only the card and the new stage state; no new page.
* If the card is not on the page, `update_deployment` renders the whole page.


# Definition of done

* [x] Feature and test
* [x] CHANGELOG
* [x] Entry D2 removed from the improvement list
