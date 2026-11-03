/**
 * Turns a <select> into a searchable TomSelect. tom-select.complete.min.js is loaded as a classic
 * script, so it has run before the page module (no inline script needed, see the CSP).
 */
export function init_source_select(id: string): void {
  if (typeof TomSelect === 'undefined' || !document.getElementById(id))
    return;
  new TomSelect(`#${id}`, {
    create: true,
    sortField: { field: 'text', direction: 'asc' }
  });
}
