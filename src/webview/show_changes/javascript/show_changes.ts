
import { showAlert } from "../../tools/javascript/alertBox";
import { typed_post } from "../../tools/javascript/post";
import { keep_ui_state } from "../../tools/javascript/ui_state";
import type { BuildSummaryRequest } from "../../../shared/messages/BuildSummaryMessages";
// Expose showAlert to the global scope for inline HTML handlers
(window as any).showAlert = showAlert;



const vscode = acquireVsCodeApi();
// Custom build summary templates post save_custom_data with window.vscode
(window as any).vscode = vscode;
const post = typed_post<BuildSummaryRequest>(vscode);

let loaded: boolean = false;

window.addEventListener("load", main);

function main() {
  if (loaded)
    return;
  loaded = true;
  
  const run_button = document.getElementById('run_build');
  if (run_button)
    run_button.addEventListener('click', run_build);  
  
  const add_source_button = document.getElementById('add_source');
  if (add_source_button)
    add_source_button.addEventListener('click', add_source);

  const add_to_package_button = document.getElementById('add_to_build_package');
  if (add_to_package_button)
    add_to_package_button.addEventListener('click', () => post({ command: "add_to_build_package" }));

  const start_deployment_button = document.getElementById('start_deployment');
  if (start_deployment_button)
    start_deployment_button.addEventListener('click', () => post({ command: 'start_deployment' }));

  // Show log, continue or run a stage of the i-Releaser deployment: the page only names the stage.
  // On the document: the card is replaced when the status changes (deployment_card)
  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('#i_releaser_status .ir-action') : null;
    if (!button)
      return;
    const action = button.dataset.action;
    const stage_id = button.dataset.stageId;
    if ((action === 'show_log' || action === 'continue' || action === 'run_all') && stage_id)
      post({ command: 'deployment_action', action: action, stage_id: stage_id });
  });
  mark_stage_rows();

  // A new status of the deployment: only its card, rendered by the extension (autoescaped, no scripts)
  window.addEventListener('message', event => {
    const message: unknown = event.data;
    if (typeof message !== 'object' || message === null || (message as { command?: unknown }).command !== 'deployment_card')
      return;
    const html = (message as { html?: unknown }).html;
    const card = document.getElementById('i_releaser_status');
    if (typeof html !== 'string' || !card)
      return;
    card.outerHTML = html;
    mark_stage_rows();
  });

  const joblogButton = document.getElementsByClassName("joblog");
  for (let i = 0; i < joblogButton.length; i++) {
    joblogButton[i].addEventListener("click", function (e) {show_log('joblog', joblogButton[i]);});
  }

  const splfButton = document.getElementsByClassName("stdout");
  for (let i = 0; i < splfButton.length; i++) {
    splfButton[i].addEventListener("click", function (e) {show_log('stdout', splfButton[i]);});
  }
  
  const errorButton = document.getElementsByClassName("stderr");
  for (let i = 0; i < errorButton.length; i++) {
    errorButton[i].addEventListener("click", function (e) {show_log('stderr', errorButton[i]);});
  }

  const editCmdButton = document.getElementsByClassName("edit_cmd");
  for (let i = 0; i < editCmdButton.length; i++) {
    editCmdButton[i].addEventListener("click", function (e) {edit_cmd(editCmdButton[i]);});
  }

  // A checkbox is written to compile-list.json at once; unchecking a source may also uncheck its dependents (asked by the extension)
  document.querySelectorAll<HTMLInputElement>('.build_source').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      checkbox.closest('tr')?.classList.toggle('is-ignored', !checkbox.checked);
      post({ command: 'ignore_source', source: checkbox.getAttribute('source') ?? '', ignore: !checkbox.checked });
    });
  });
  document.querySelectorAll<HTMLInputElement>('.build_source_cmd').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      checkbox.closest('.cmd')?.classList.toggle('is-ignored', !checkbox.checked);
      post({
        command: 'ignore_cmd',
        level: checkbox.getAttribute('level') ?? '',
        source: checkbox.getAttribute('source') ?? '',
        cmd_index: Number(checkbox.getAttribute('cmd_index')),
        ignore: !checkbox.checked
      });
    });
  });

  const openFileButton = document.getElementsByClassName("open_file");
  for (let i = 0; i < openFileButton.length; i++) {
    openFileButton[i].addEventListener("click", function (e) {open_file(openFileButton[i]);});
  }


  // Scroll position, opened commands and collapsed levels survive an update of the page (e.g. after a build)
  const ui = keep_ui_state(vscode);
  const collapsed = new Set<string>(ui.get<string[]>('collapsed_levels') ?? []);

  document.querySelectorAll<HTMLElement>('.collapsible-header').forEach(header => {
    // The target class name from the data attribute (e.g., "level-1")
    const targetClass = header.getAttribute('data-target') ?? '';
    const show_level = (visible: boolean) => {
      document.querySelectorAll<HTMLElement>('.' + CSS.escape(targetClass)).forEach(row => row.classList.toggle('level-hidden', !visible));
      const icon = header.querySelector('.toggle-icon');
      icon?.classList.toggle('codicon-chevron-down', visible);
      icon?.classList.toggle('codicon-chevron-right', !visible);
    };

    if (collapsed.has(targetClass))
      show_level(false);

    header.addEventListener('click', function() {
      const visible = collapsed.has(targetClass);
      show_level(visible);
      if (visible)
        collapsed.delete(targetClass);
      else
        collapsed.add(targetClass);
      ui.set('collapsed_levels', Array.from(collapsed));
    });
  });

  // The commands of a source, below its row: open for failed sources until the user toggles them
  const opened = { ...(ui.get<Record<string, boolean>>('commands_open') ?? {}) };
  document.querySelectorAll<HTMLButtonElement>('.cmds-toggle').forEach(toggle => {
    const row = document.getElementById(toggle.dataset.cmds ?? '');
    const key = toggle.dataset.cmdsKey ?? '';
    if (!row)
      return;
    const show = (open: boolean) => {
      row.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      const icon = toggle.querySelector('.codicon');
      icon?.classList.toggle('codicon-chevron-down', open);
      icon?.classList.toggle('codicon-chevron-right', !open);
    };
    show(key in opened ? opened[key] : toggle.dataset.defaultOpen === 'true');
    toggle.addEventListener('click', () => {
      const open = row.hidden === true;
      show(open);
      opened[key] = open;
      ui.set('commands_open', opened);
    });
  });

  // Copy a build command
  document.querySelectorAll<HTMLButtonElement>('.cmd-copy').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      const icon = button.querySelector('.codicon');
      navigator.clipboard.writeText(button.dataset.cmd ?? '').then(() => {
        icon?.classList.replace('codicon-copy', 'codicon-check');
        setTimeout(() => icon?.classList.replace('codicon-check', 'codicon-copy'), 1500);
      }, () => undefined);
    });
  });
}




let stage_rows_observer: ResizeObserver | undefined;

/** The stages of a deployment wrap into rows: the first stage of a row gets no line from the stage before */
function mark_stage_rows() {
  // A replaced card has a new list: observe only that one
  stage_rows_observer?.disconnect();
  const list = document.getElementById('i_releaser_stages');
  if (!list)
    return;
  const mark = () => {
    let top: number | undefined;
    list.querySelectorAll<HTMLElement>('.ir-stage').forEach(stage => {
      stage.classList.toggle('ir-row-start', top !== undefined && stage.offsetTop > top);
      top = stage.offsetTop;
    });
  };
  mark();
  stage_rows_observer = new ResizeObserver(mark);
  stage_rows_observer.observe(list);
}



function run_build() {

  const build_source = document.getElementsByClassName("build_source");
  const build_source_cmd = document.getElementsByClassName("build_source_cmd");
  let ignore_sources: string[] = [];
  let ignore_sources_cmd: Record<string, string[]> = {};

  for (let i = 0; i < build_source.length; i++) {
    const checkbox = build_source[i] as HTMLInputElement;
    if (!checkbox.checked) {
      ignore_sources.push(checkbox.getAttribute('source') || '');
    }
  }

  for (let i = 0; i < build_source_cmd.length; i++) {
    const checkbox = build_source_cmd[i] as HTMLInputElement;
    if (!checkbox.checked) {
      const source = checkbox.getAttribute('source');
      if (source !== null) {
        if (!ignore_sources_cmd[source]) {
          ignore_sources_cmd[source] = [];
        }
        ignore_sources_cmd[source].push(checkbox.getAttribute('cmd') || '');
      }
    }
  }

  post({
    command: "run_build",
    ignore_sources: ignore_sources,
    ignore_sources_cmd: ignore_sources_cmd
  });
}


function add_source() {
  post({
    command: "add_source"
  });
}


function edit_cmd(e: Element) {
  const level: string = e.getAttribute('level') || '';
  const source: string = e.getAttribute('source') || '';
  const cmd_index: number = Number(e.getAttribute('cmd_index'));

  post({
    command: "edit_cmd",
    level: level,
    cmd_index: cmd_index,
    source: source
  });
}


//--function handleHowdyClick() {
function show_log(log_type: 'joblog' | 'stdout' | 'stderr', e: Element) {
  const level: string = e.getAttribute('level') || '';
  const source: string = e.getAttribute('source') || '';
  const cmd_index: number = Number(e.getAttribute('cmd_index'));

  post({
    command: "show_log",
    type: log_type,
    level: level,
    cmd_index: cmd_index,
    source: source
  });
}


//--function handleHowdyClick() {
function open_file(e: Element) {
  const source: string = e.getAttribute('data-file') || '';

  post({
    command: "open_file",
    source: source
  });
}
