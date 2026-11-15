import { typed_post } from "../../tools/javascript/post";
import type { ControllerRequest } from "../../../shared/messages/ControllerMessages";


const vscode = acquireVsCodeApi();
const post = typed_post<ControllerRequest>(vscode);

type RunType = 'single' | 'all';

interface ViewState {
  run_type?: RunType;
  profiles?: { alias: string; description: string }[];
  selected_profile?: string;
}

/** When the running operation started (for the elapsed time) */
let running_since: number | undefined;
let running_timer: ReturnType<typeof setInterval> | undefined;

window.addEventListener("load", main);

function main() {

  document.getElementById("run_build")?.addEventListener("click", run_build);
  document.getElementById("show_changes")?.addEventListener("click", show_changes);
  document.getElementById("cancel_running")?.addEventListener("click", () => post({ command: "cancel_running" }));
  document.getElementById("btn_delete_current_profile")?.addEventListener("click", () => post({ command: "delete_current_profile" }));
  document.getElementById("btn_copy_profile")?.addEventListener("click", () => post({ command: "copy_profile" }));
  document.getElementById("drp_use_profile")?.addEventListener("change", change_profile);

  const open_summary = document.getElementById("open_build_summary");
  open_summary?.addEventListener("click", () => post({ command: "open_build_summary" }));
  open_summary?.addEventListener("keydown", event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      post({ command: "open_build_summary" });
    }
  });

  // Current source | All changes
  const state = (vscode.getState() ?? {}) as ViewState;
  document.querySelectorAll<HTMLButtonElement>('#opt_run_type .seg-option').forEach(option => {
    option.addEventListener('click', () => set_run_type(option.dataset.value === 'all' ? 'all' : 'single'));
  });
  set_run_type(state.run_type ?? 'single');

  if (state.profiles)
    update_profile_drp(state.profiles);
  if (state.selected_profile !== undefined)
    set_current_profile(state.selected_profile);

  // The page may have been rendered while something runs
  const ring = document.getElementById("running_ring");
  if (ring && ring.style.display !== 'none')
    set_running(ring.title || document.getElementById('running_label')?.textContent || '');

  window.addEventListener('message', receive_message);
}


function set_run_type(run_type: RunType) {
  const group = document.getElementById("opt_run_type");
  if (!group)
    return;
  group.dataset.value = run_type;
  group.querySelectorAll<HTMLButtonElement>('.seg-option').forEach(option =>
    option.setAttribute('aria-checked', String(option.dataset.value === run_type)));
  updateState({ run_type: run_type });
}


function get_run_type(): RunType {
  return document.getElementById("opt_run_type")?.dataset.value === 'all' ? 'all' : 'single';
}


/** Shows the running box with `label` and the elapsed time, or the buttons again */
function set_running(label: string | undefined) {
  const ring = document.getElementById("running_ring");
  if (!ring)
    return;
  const running = label !== undefined && label !== '';
  ring.style.display = running ? 'flex' : 'none';
  ring.title = running ? label : '';
  document.body.classList.toggle('is-running', running);
  const text = document.getElementById("running_label");
  if (text)
    text.textContent = running ? label : '';

  const time = document.getElementById("running_time");
  if (running) {
    running_since ??= Date.now();
    const show = () => {
      const seconds = Math.floor((Date.now() - (running_since ?? Date.now())) / 1000);
      if (time)
        time.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    };
    show();
    running_timer ??= setInterval(show, 1000);
  }
  else {
    running_since = undefined;
    clearInterval(running_timer);
    running_timer = undefined;
    if (time)
      time.textContent = '';
  }
}


function change_profile(event: Event) {
  const value = (event.target as HTMLSelectElement).value || "";
  updateState({ selected_profile: value });
  post({ command: "change_profile", profile: value });
}


function run_build() {
  const ring = document.getElementById("running_ring");
  ring?.setAttribute("data-process", "run_build");
  set_running(document.getElementById("run_build")?.textContent?.trim() ?? '');
  post({ command: get_run_type() == "all" ? 'run_build' : 'run_single_build' });
}


function show_changes() {
  const ring = document.getElementById("running_ring");
  ring?.setAttribute("data-process", "show_changes");
  set_running(document.getElementById("show_changes")?.textContent?.trim() ?? '');
  post({ command: get_run_type() == "all" ? 'show_changes' : 'show_single_changes' });
}


function receive_message(e: MessageEvent) {

  switch (e.data.command) {

    case 'run_finished': {
      const ring = document.getElementById("running_ring");
      if (ring && ring.getAttribute("data-process") == e.data.process)
        set_running(undefined);
      break;
    }

    case 'running_state':
      // Busy state of the extension (OperationLock), also for operations not started from this view
      set_running(typeof e.data.running === 'string' ? e.data.running : undefined);
      break;

    case 'update_build_summary_timestamp': {
      const line = document.getElementById("last_build");
      const last = e.data.last_build as { kind: 'failed' | 'success' | 'open'; text: string } | undefined;
      if (!line)
        break;
      line.hidden = !last;
      if (!last)
        break;
      const text = document.getElementById("last_build_text");
      if (text)
        text.textContent = last.text;
      const icon = document.getElementById("last_build_icon");
      if (icon)
        icon.className = `codicon ${{ failed: 'codicon-error obi-failed', success: 'codicon-pass obi-passed', open: 'codicon-circle-large-outline obi-muted' }[last.kind] ?? ''}`;
      break;
    }

    case 'current_source': {
      const name = document.getElementById("current_source_name");
      if (name) {
        name.textContent = typeof e.data.name === 'string' && e.data.name !== '' ? e.data.name : (e.data.none ?? '');
        name.title = typeof e.data.source === 'string' ? e.data.source : '';
      }
      break;
    }

    case 'update_current_profile':
      update_profile_drp(e.data.profiles);
      set_current_profile(e.data.current_profile);
      break;
  }
}


function update_profile_drp(profiles: { alias: string; description: string }[]) {
  const drp_use_profile = document.getElementById("drp_use_profile") as HTMLSelectElement | null;
  if (!drp_use_profile || !Array.isArray(profiles))
    return;
  drp_use_profile.replaceChildren(...profiles.map(profile => {
    const option = document.createElement("option");
    option.value = profile.alias;
    option.textContent = profile.description;
    return option;
  }));
  updateState({ profiles: profiles });
}


function set_current_profile(profile_alias: string | undefined) {
  // The default profile has no alias: the extension sends undefined or ''
  const alias = typeof profile_alias === 'string' ? profile_alias : '';
  const drp_use_profile = document.getElementById("drp_use_profile") as HTMLSelectElement | null;
  if (drp_use_profile)
    drp_use_profile.value = alias;
  updateState({ selected_profile: alias });
}


/** Merges `data` into the state of the view */
function updateState(data: ViewState) {
  vscode.setState({ ...((vscode.getState() ?? {}) as ViewState), ...data });
}
