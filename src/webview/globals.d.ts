declare global {
  /** tom-select.complete.min.js from out/vendor (global, see scripts/copy-vendor.js) */
  class TomSelect {
    constructor(selector: string | HTMLElement, options: Record<string, unknown>);
  }

  interface HTMLElementTagNameMap {
    "vscode-option": HTMLElement & { value: string; selected?: boolean };
    "vscode-dropdown": HTMLElement & { value: string };
    "vscode-button": HTMLElement;
  }
}

// The 'export {}' is necessary to make this a module file
export {};