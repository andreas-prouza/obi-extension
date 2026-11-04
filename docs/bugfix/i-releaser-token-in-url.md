# i-Releaser auth token is sent in the URL

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟡 | ready, partly done (2026-11-04): header, URL building and status check are in [IReleaser.ts](../../src/shared/IReleaser.ts), used by the build summary and `I_Releaser.get_workflows`. Open: rejecting `http` URLs (the i-Releaser in use runs on `http`) | [security.md S13](../improvements/security.md#s13--i-releaser-auth-token-in-the-url-query) | i-Releaser 3.1.0 accepts the header |

Fix before the deployment views (`when: 1==2`) are enabled again. See [i-releaser-deployment.md](../features/i-releaser-deployment.md).


# Current situation

[I_Releaser.ts:108](../../src/webview/deployment/I_Releaser.ts#L108):

```ts
const response = await fetch(`${config['i-releaser'].url}/api/get_workflows?auth-token=${auth_token}`);
```

* The token is visible in proxy logs, web server access logs and browser-like caches.
* The URL is built by string concatenation, so the token isn't URL-encoded, and a trailing `/` in the configured URL produces `//api`.
* `http://` URLs are accepted, which sends the token in clear text.


# Fix

## 1. Header instead of query parameter

```ts
const base = new URL(config['i-releaser'].url);
if (base.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(base.hostname))
  throw new Error('i-Releaser URL must use https');

const url = new URL('api/get_workflows', base.href.endsWith('/') ? base : `${base.href}/`);
const response = await fetch(url, { headers: { Authorization: `Bearer ${auth_token}` } });
if (!response.ok)
  throw new Error(`i-Releaser: HTTP ${response.status}`);
```

## 2. Server side

The i-Releaser API has to accept the `Authorization: Bearer` header. Until it does, keep the query parameter only behind an explicit, documented compatibility flag. Don't keep it silently.

## 3. Logging

Make sure `logger.error(e, e.stack)` in `get_workflows` can never contain the URL with the token (no token in the URL after step 1).


# Tests

* Unit test for the URL building: base `https://host/ir` and `https://host/ir/` both produce `https://host/ir/api/get_workflows`; `http://host` throws; `http://localhost:8080` is accepted.


### Definition of done
* Token sent only in the `Authorization` header
* Non-https URLs rejected except for localhost
* Response status checked
* i-Releaser server supports the header (or the compatibility flag is documented)
* CHANGELOG entry when the deployment views are released
