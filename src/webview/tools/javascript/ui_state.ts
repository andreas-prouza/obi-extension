// UI state of a page (scroll position, sections the user opened or closed) in the webview state.
// The state survives replacing the page's HTML, so an update after a build keeps the view as it was.

interface StateApi {
  getState(): unknown;
  setState(state: unknown): void;
}

export interface UiState {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
}


export function keep_ui_state(vscode: StateApi): UiState {
  const stored = vscode.getState();
  const state: Record<string, unknown> = stored && typeof stored === 'object' ? { ...(stored as Record<string, unknown>) } : {};
  const save = () => vscode.setState(state);

  // <details data-state-id="…">: only sections the user toggled keep their state, new ones keep their default
  const toggled: Record<string, boolean> = { ...(state['details'] as Record<string, boolean> | undefined) };
  document.querySelectorAll<HTMLDetailsElement>('details[data-state-id]').forEach(details => {
    const id = details.dataset.stateId ?? '';
    if (id in toggled)
      details.open = toggled[id];
    details.addEventListener('toggle', () => {
      toggled[id] = details.open;
      state['details'] = toggled;
      save();
    });
  });

  // Scroll position; restored again after the web components got their size
  const scroll_y = state['scroll_y'];
  if (typeof scroll_y === 'number' && scroll_y > 0) {
    requestAnimationFrame(() => window.scrollTo(0, scroll_y));
    setTimeout(() => window.scrollTo(0, scroll_y), 250);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('scroll', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state['scroll_y'] = window.scrollY;
      save();
    }, 100);
  });

  return {
    get: <T>(key: string) => state[key] as T | undefined,
    set: (key: string, value: unknown) => {
      state[key] = value;
      save();
    }
  };
}
