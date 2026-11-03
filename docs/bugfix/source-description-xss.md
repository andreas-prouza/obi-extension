# Script injection via source descriptions

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🔴 | finished (template tests; editing in the panel still to be checked manually) | [security.md S5](../improvements/security.md#s5--stored-xss-in-the-source-description-editor) | – |

Prerequisite for: [features/webview-csp.md](../features/webview-csp.md).


# Current situation

[source-infos-config.html:66](../../asserts/templates/source_list/source-infos-config.html#L66) puts the description into a JavaScript string inside an inline handler:

```html
onfocusout="update_cell({{ loop.index0 }}, '{{ row['description'] }}', this, event)"
```

Nunjucks escapes `'` to `&#39;`, but the browser decodes entities in attribute values **before** it compiles the handler. A description `x');alert(1);//` therefore runs as code.

The inline function `update_cell` ([source-infos-config.html:93-116](../../asserts/templates/source_list/source-infos-config.html#L93-L116)) then rebuilds the cell as an HTML string from `element.value`. That is the same problem again, also with `"`.

`source-infos.json` is usually committed, so one person's description runs in every team member's webview. The webview has `enableScripts` and `enableCommandUris`.

A legitimate description such as `Customer's orders` already causes a syntax error, and the field can no longer be saved.

The read-only view ([source-infos-view.html](../../asserts/templates/source_list/source-infos-view.html)) only uses escaped text content and is not affected.


# Fix

## 1. Template: no inline JavaScript

Replace the field with data attributes only:

```html
<tr id="row_{{ loop.index0 }}" data-row-index="{{ loop.index0 }}">
  …
  <td style="white-space: nowrap;">
    <vscode-text-field class="source_description" size="80"
      placeholder="{{ global_stuff['get_text']('description') | safe }}"
      data-lib="{{ row['source-lib'] }}" data-file="{{ row['source-file'] }}" data-member="{{ row['source-member'] }}"
      data-original="{{ row['description'] }}"
      value="{{ row['description'] }}"></vscode-text-field>
  </td>
</tr>
```

* Remove the inline `<script>` block with `update_cell` (lines 91–119).
* Keep the existing element ids only if something else needs them. Ids built from `lib|file|member` are not needed.

## 2. Bundled script `source_infos.ts`

Move the behaviour of `update_cell` into [source_infos.ts](../../src/webview/source_list/javascript/source_infos.ts):

* Use event delegation on the table: `focusout` on `.source_description`. If `field.value !== field.dataset.original`, update `dataset.original` and trigger the save.
* Don't rebuild the cell via `bootstrapTable('updateCell', …)` with an HTML string. The text field already holds the new value. If bootstrap-table's internal data must be updated for sorting or filtering, pass plain text and use `escape: true` on that column (`data-escape="true"` on the `<th>`).
* `save_config()` reads `dataset.lib`, `dataset.file`, `dataset.member` instead of the custom attributes `lib`, `file`, `member`.
* Restore focus via `event.relatedTarget` only if it is an `HTMLElement` (today `event.relatedTarget.id` throws when focus leaves the page).

## 3. Same check for other templates

Search all templates for `{{` inside `on…="…"` attributes and inside `<script>` blocks. Today only this file uses `{{` inside a handler. The inline scripts in `configuration.html` (`panel = "{{ panel }}"`) are moved in [webview-csp.md](../features/webview-csp.md).


# Tests

* Manual or integration: create descriptions `Customer's orders`, `x');alert(1);//`, `<img src=x onerror=alert(1)>` and `a "quoted" text`. Open *Maintain source infos*, edit and save. Expected: each value is shown and saved as text, and no script runs.
* Regression: a grep check in the test suite (or ESLint/CI script) that fails if any template contains `on[a-z]+="[^"]*{{`.


### Definition of done
* `source-infos-config.html` contains no inline event handlers and no inline `<script>`
* Saving descriptions works for values containing `'`, `"`, `<`, `>`, `&`
* No HTML string concatenation with user data in `source_infos.ts`
* CI/test check against `{{` inside inline handlers
* CHANGELOG entry
