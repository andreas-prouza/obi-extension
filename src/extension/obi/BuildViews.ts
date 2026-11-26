/**
 * What the build commands (OBICommands) need from the views in src/webview. extension.ts registers it, so
 * src/extension imports nothing from src/webview (layers, import cycles; check-repo.js). Until it is registered
 * (e.g. in tests, which use their own copy of the modules), nothing is shown.
 */
export interface BuildViews {
  /** OBI Build view: the operation ended (busy indicator off, response of the backend) */
  run_finished(process: 'run_build' | 'show_changes'): void;
  /** OBI Build view: time and result of the last build */
  last_build_changed(): void;
  /** Opens the build summary of the current build list (or shows it again) */
  show_build_summary(): void;
  /** Renders the open build summary again */
  update_build_summary(): Promise<void>;
  /** The open build summary switches to the current build list (it may show one of the history) */
  show_current_results(): Promise<void>;
  /** compile-list.json of the build list the build summary shows (relative to the workspace) */
  shown_compile_list(): string;
  /** Deletes old builds of the history; `keep`: the build just added */
  apply_history_retention(keep: string): Promise<unknown>;
  /** Selects a build in the build history view */
  reveal_history_build(history_dir_name: string): Promise<void>;
}
