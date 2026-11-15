# The OBI Build view has no Content-Security-Policy

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🔴 | finished | Found 2026-11-15 while rendering the view for the UI redesign | [webview-csp.md](../features/webview-csp.md) |


# Current situation

* [controller/index.html](../../asserts/templates/controller/index.html) line 2 has no closing quote: `<html lang="en" data-bs-theme="{{ global_stuff['theme_mode'] }}>` (since 0.6.1).
* The browser reads everything up to the next `"` as the value of `data-bs-theme`: `dark>`, `<head>` and the start of the CSP `<meta>` tag. `content="default-src 'none'; …"` becomes an attribute of `<html>`. The page has no `<meta http-equiv="Content-Security-Policy">`, so no CSP applies in the OBI Build view.
* `check:repo` only checks that a page template includes `tools/csp.html`, so it didn't notice.


# Fix

* The missing quote.
* `check:repo`: an odd number of `"` before `{% include "tools/csp.html" %}` (Nunjucks tags removed) is a finding. With the old template it reports `asserts/templates/controller/index.html: unclosed attribute quote before {% include "tools/csp.html" %} (the CSP would not apply)`.


# Tests

* `npm run check:repo` with the old and the fixed template.
* The fixed template parsed by Chrome (`--dump-dom`): the `<meta http-equiv="Content-Security-Policy">` is in `<head>`.
