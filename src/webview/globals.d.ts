declare global {
  interface HTMLElementTagNameMap {
    "vscode-option": HTMLElement & { value: string; selected?: boolean };
    "vscode-dropdown": HTMLElement & { value: string };
    "vscode-button": HTMLElement;
  }
}

// The 'export {}' is necessary to make this a module file
export {};