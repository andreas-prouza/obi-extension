// Settings of bootstrap-table for the pages with a table (source filter view, source infos).
// The pages call prepare_tables() before the tables are set up (that happens on DOMContentLoaded,
// page modules run before).

interface BootstrapTableDefaults {
  iconsPrefix?: string;
  icons?: Record<string, string>;
}

interface JQueryWithTable {
  fn?: { bootstrapTable?: { defaults?: BootstrapTableDefaults } };
}


/** Name of the compare function for text filters: data-filter-custom-search="obi_cell_text_search" on the column */
const CELL_TEXT_SEARCH = 'obi_cell_text_search';


/** What a cell shows: the value of its input field, else its text (a link's target or other attributes don't count) */
export function cell_text(html: unknown): string {
  const cell = document.createElement('template');
  cell.innerHTML = String(html ?? '');
  const input = cell.content.querySelector('input, textarea');
  return input ? (input as HTMLInputElement).value : cell.content.textContent ?? '';
}


export function prepare_tables(): void {
  use_codicons_in_tables();
  // Text filters compare with the raw cell HTML: a filter like "test" would also find the path in a link's target
  (window as unknown as Record<string, unknown>)[CELL_TEXT_SEARCH] =
    (text: unknown, value: unknown) => cell_text(value).toLowerCase().includes(String(text ?? '').toLowerCase());
}


/** bootstrap-table draws its buttons with bootstrap-icons (bi-*), which the extension doesn't ship: use the codicons */
function use_codicons_in_tables(): void {
  const defaults = (window as unknown as { jQuery?: JQueryWithTable }).jQuery?.fn?.bootstrapTable?.defaults;
  if (!defaults)
    return;
  defaults.iconsPrefix = 'codicon';
  defaults.icons = {
    paginationSwitchDown: 'codicon-chevron-down',
    paginationSwitchUp: 'codicon-chevron-up',
    refresh: 'codicon-refresh',
    toggleOff: 'codicon-list-flat',
    toggleOn: 'codicon-table',
    columns: 'codicon-list-selection',
    detailOpen: 'codicon-add',
    detailClose: 'codicon-remove',
    fullscreen: 'codicon-screen-full',
    search: 'codicon-search',
    clearSearch: 'codicon-clear-all',
  };
}
