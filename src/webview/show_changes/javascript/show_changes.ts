import "../../tools/javascript/toolkit";
import {
  Button
} from "@vscode/webview-ui-toolkit";

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
  // To get improved type annotations/IntelliSense the associated class for
  // a given toolkit component can be imported and used to type cast a reference
  // to the element (i.e. the `as Button` syntax)

  if (loaded)
    return;
  loaded = true;
  
  const run_button = document.getElementById('run_build') as Button;
  if (run_button)
    run_button.addEventListener('click', run_build);  
  
  const add_source_button = document.getElementById('add_source') as Button;
  if (add_source_button)
    add_source_button.addEventListener('click', add_source);
  
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

  const openFileButton = document.getElementsByClassName("open_file");
  for (let i = 0; i < openFileButton.length; i++) {
    openFileButton[i].addEventListener("click", function (e) {open_file(openFileButton[i]);});
  }


  // Scroll position, opened commands and collapsed levels survive an update of the page (e.g. after a build)
  const ui = keep_ui_state(vscode);
  const collapsed = new Set<string>(ui.get<string[]>('collapsed_levels') ?? []);

  const headers = document.querySelectorAll<HTMLElement>('.collapsible-header');

  headers.forEach(header => {
    // The target class name from the data attribute (e.g., "level-1")
    const targetClass = header.getAttribute('data-target') ?? '';
    const show_level = (visible: boolean) => {
      document.querySelectorAll<HTMLElement>('.' + targetClass).forEach(row => {
        row.style.display = visible ? 'table-row' : 'none';
      });
      const icon = header.querySelector('.toggle-icon');
      if (icon)
        icon.textContent = visible ? '▼' : '▶';
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
