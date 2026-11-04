# Start an i-Releaser workflow from the build summary

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (Unreleased; tested against a local HTTP server, not yet against a real i-Releaser) | User report 2026-11-04: CSP errors of a custom build summary template | [webview-csp.md](webview-csp.md), [i-releaser-token-in-url.md](../bugfix/i-releaser-token-in-url.md) |


# Current situation

* Projects started i-Releaser deployments with a custom build summary template (`.obi/.vscode/templates/custom_build_list_template.html`). The template:
  * read the build list with the message `file_content`;
  * removed the joblogs;
  * sent the list with `fetch` to `…/api/start_workflow/<workflow>?auth-token=…`;
  * stored the answer with `save_custom_data` as `custom_data.json`.
* Since 1.4.1 none of this works. The CSP blocks the inline script and `onclick`, `file_content` was removed (it read any file), and `default-src 'none'` blocks the `fetch`.
* The token was in the user TOML, in the page, and in the URL.
* The extension already has a deployment config: `.obi/etc/deployment.toml` plus a token in the secret storage. But:
  * its page and the i-Releaser view were disabled (`when: 1==2`, command registration commented out);
  * the token was one key for all URLs;
  * `I_Releaser.get_workflows` sent it in the URL.


# Feature

* **Build summary:**
  * **Start i-Releaser workflow** is shown when the build list is completed and `deployment.toml` has an http(s) URL.
  * **i-Releaser deployment** links to `<url>/show_details/<id>` of the deployment stored in the build list. For lists of the old template it reads `custom_data.json.meta_file.general.id`.
* **Start** (`start_deployment`, no fields from the page):
  1. Requires a trusted workspace: the URL comes from the workspace, and the token is sent there. Runs under the `OperationLock`.
  2. Token from the secret storage under `obi|deployment|http_auth_token|<origin>`. Without it: an error with *Open deployment config*.
  3. `GET /api/get_workflows`, then a QuickPick with the `default-workflow` first. The pick also confirms the start.
  4. `POST /api/start_workflow/<workflow>`. The body is the build list without `joblog`/`stdout`/`stderr`, without `config` (older lists contain it with secret variables), and without earlier deployments (`custom_data.i-releaser`, `custom_data.json`).
  5. Stores `{ id, workflow, project, deploy_version, started }` as `custom_data['i-releaser']` and re-renders the page. A message offers *Open*.
* Requests ([IReleaser.ts](../../src/shared/IReleaser.ts), no vscode import):
  * `Authorization: Bearer`, `Accept: application/json`, no redirects (a redirect means an older i-Releaser sends the login page).
  * Errors show the server's `message`, never the token.
  * Cancellable; aborted after 60 s.
* **Deployment config:**
  * The command `obi.deployment.maintain` (*OBI: deployment config*) is registered again and shown in the Command Palette.
  * The token is stored per origin of the URL. A token stored without a valid URL is refused.
* `I_Releaser.get_workflows` (the view is still hidden) uses the same client.

Not done: [i-releaser-token-in-url.md](../bugfix/i-releaser-token-in-url.md) asks to reject `http` URLs, but the i-Releaser in use runs on `http`. The docs recommend `https`.

Earlier tokens under the key `obi|deployment|http_auth_token` aren't used any more: enter them again in the deployment config.


# Tests

* **Unit**, [IReleaser.test.ts](../../src/test/unit/IReleaser.test.ts), against a local HTTP server:
  * URL checks;
  * header, method, path and body;
  * error answers, including redirect, HTML, and the old `Error` format;
  * the token is never in a message;
  * not reachable, and cancelled;
  * the request body;
  * stored deployments.
* **Integration**, [IReleaserDeployment.test.ts](../../src/test/suite/IReleaserDeployment.test.ts):
  * the button and the link;
  * a full start with workflow order, headers, body and stored record;
  * no request without a token for the URL (even when another URL has one) or without a pick;
  * untrusted workspace;
  * the message from the page carries no fields.


### Definition of done
* Done: start, link and deployment config work without a custom template.
* Done: the token is never in the page, never in a URL, and only sent to the URL it was stored for.
* Done: docs ([building.md](../../asserts/docs/building.md#i-releaser-deployment)) and CHANGELOG.
