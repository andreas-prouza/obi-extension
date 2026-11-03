# Stored secrets are rendered into webview HTML

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🔴 | finished | [security.md S4](../improvements/security.md#s4--stored-secrets-are-sent-back-into-webview-html) | – |


# Current situation

* The config page reads the SSH password from `SecretStorage` ([OBIConfiguration.ts:109](../../src/webview/controller/OBIConfiguration.ts#L109)) and passes it to the template as `SSH_PASSWORD` ([OBIConfiguration.ts:126](../../src/webview/controller/OBIConfiguration.ts#L126)). [config_details.html:56-57](../../asserts/templates/controller/config_details.html#L56-L57) renders it as `value="{{ SSH_PASSWORD }}"`. The secret is then part of the webview DOM, visible in webview devtools and readable by any script in the page.
* The i-Releaser token takes the same route ([DeploymentConfig.ts:105-114](../../src/webview/deployment/DeploymentConfig.ts#L105-L114), [deployment-config.html:29](../../asserts/templates/deployment/deployment-config.html#L29)).
* `DeploymentConfig.save_config` ([DeploymentConfig.ts:166-175](../../src/webview/deployment/DeploymentConfig.ts#L166-L175)) stores `auth-token || ''`, so an empty field overwrites the stored token with an empty string.


# Fix

Treat secret fields as **write-only**.

## 1. Extension side

* `OBIConfiguration.generate_html`: pass `ssh_password_stored: boolean` (`pwd !== undefined && pwd.length > 0`) instead of the password.
* `DeploymentConfig.generate_html`: pass `auth_token_stored: boolean` instead of the token.
* New message `delete_ssh_password` in `OBIConfiguration.onReceiveMessage`: deletes `obi|<profile>|<host>|<user>` and re-renders.
* `save_ssh_password`: only store when `message.password` is a non-empty string (today it deletes first and then stores, which is fine; keep the delete, drop nothing else).
* `DeploymentConfig.save_config`: only call `secrets.store` when the field is non-empty. Add a `delete_auth_token` message for removing it.

## 2. Templates

`config_details.html`, user tab:

```html
<vscode-text-field id="user|SSH_PASSWORD" type="password" value=""
  placeholder="{% if ssh_password_stored %}{{ global_stuff['get_text']('Password stored – type to replace') }}{% endif %}">
  🔑 {{ global_stuff['get_text']('Password') | safe }}
</vscode-text-field>
{% if ssh_password_stored %}
  <vscode-button id="delete_ssh_password" appearance="icon" title="{{ global_stuff['get_text']('Remove stored password') }}">
    <span class="codicon codicon-trash"></span>
  </vscode-button>
{% endif %}
```

Same pattern for `i-releaser|auth-token` in `deployment-config.html`. Add the new texts to `package.nls.json`, `package.nls.de.json` and `package.nls.en.json`.

## 3. Webview script

* [config.ts](../../src/webview/controller/javascript/config.ts): attach a click handler to `#delete_ssh_password` that posts `{ command: 'delete_ssh_password' }`. The existing `save_configs` already sends the password only when the field is non-empty.
* [deployment_config.ts](../../src/webview/deployment/javascript/deployment_config.ts): send `auth-token` only when non-empty.


# Tests

* Unit/integration test: render `controller/configuration.html` through `OBIConfiguration.generate_html` with a stored secret, and assert that the returned HTML does not contain the secret value.
* Manual: store a password, reopen the config page (field empty with placeholder), save other settings (password remains stored), click remove (connection prompts for the password again).


### Definition of done
* No code path passes a value from `SecretStorage` into a template or `postMessage`
* Empty secret fields mean "unchanged"; removal is an explicit button
* New texts exist in all three `package.nls*.json` files
* Test asserting the secret is absent from the rendered HTML
* CHANGELOG entry
