# SecretStorage used for UI state

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟡 | finished | [security.md S14](../improvements/security.md#s14--secretstorage-is-used-for-ui-state) | – |


# Current situation

The config page remembers the last selected tab in the OS keychain:
* read: [OBIConfiguration.ts:115-116](../../src/webview/controller/OBIConfiguration.ts#L115-L116) (`obi|config|panel`, `obi|config|panel_tab`)
* write: [OBIConfiguration.ts:178-181](../../src/webview/controller/OBIConfiguration.ts#L178-L181), on **every** message that contains `panel` / `panel_tab`, which is almost all of them

The keychain is meant for secrets. Each access is a round-trip to the OS keychain (libsecret / Keychain / Credential Manager), which is slow and on some Linux setups can show unlock prompts.


# Fix

1. Replace the four calls with `workspaceState`:
   ```ts
   const panel = OBIConfiguration._context.workspaceState.get<string>('obi.config.panel');
   …
   if (message.panel && message.panel !== OBIConfiguration._context.workspaceState.get('obi.config.panel'))
     OBIConfiguration._context.workspaceState.update('obi.config.panel', message.panel);
   ```
   Same for `panel_tab`. Only write when the value changed.
2. One-time clean-up at activation (keep the code for a few releases):
   ```ts
   context.secrets.delete('obi|config|panel');
   context.secrets.delete('obi|config|panel_tab');
   ```
3. Validate the values before using them in the template: they are rendered into `<script>` today ([configuration.html:120-123](../../asserts/templates/controller/configuration.html#L120-L123)). Allow only `^[a-z_]+$` / `^tab-\d+$`; anything else falls back to the defaults. (The inline script itself is removed in [webview-csp.md](../features/webview-csp.md).)


### Definition of done
* No `secrets.get/store` for non-secret values anywhere in the code base (grep: only SSH password and i-Releaser token remain)
* Selected tab is restored from `workspaceState`
* Old keychain entries are deleted on activation
* CHANGELOG entry
