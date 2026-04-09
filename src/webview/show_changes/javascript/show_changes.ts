import {
  allComponents,
  provideVSCodeDesignSystem,
  Button
} from "@vscode/webview-ui-toolkit";

// In order to use all the Webview UI Toolkit web components they
// must be registered with the browser (i.e. webview) using the
// syntax below.
provideVSCodeDesignSystem().register(allComponents);

const vscode = acquireVsCodeApi();

let loaded: boolean = false;

window.addEventListener("load", main);

function main() {
  // To get improved type annotations/IntelliSense the associated class for
  // a given toolkit component can be imported and used to type cast a reference
  // to the element (i.e. the `as Button` syntax)

  console.log(`Load main ${loaded}`);
  if (loaded)
    return;
  loaded = true;
  
  const run_button = document.getElementById('run_build') as Button;
  console.log(`run_button.addEventListener ${run_button}`);
  if (run_button)
    run_button.addEventListener('click', run_build);  
  
  const joblogButton = document.getElementsByClassName("joblog");
  console.log(`joblog.addEventListener ${joblogButton.length}`);
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

  const openFileButton = document.getElementsByClassName("open_file");
  for (let i = 0; i < openFileButton.length; i++) {
    openFileButton[i].addEventListener("click", function (e) {open_file(openFileButton[i]);});
  }


  const headers = document.querySelectorAll('.collapsible-header');

  headers.forEach(header => {
    header.addEventListener('click', function() {
      // Get the target class name from the data attribute (e.g., "level-1")
      const targetClass = this.getAttribute('data-target');
      // Find all rows with that class
      const contentRows = document.querySelectorAll('.' + targetClass);
      // Find the icon to toggle it
      const icon = this.querySelector('.toggle-icon');

      contentRows.forEach(row => {
        // Toggle the display property
        if (row.style.display === 'none') {
          row.style.display = 'table-row'; // Show the row
        } else {
          row.style.display = 'none'; // Hide the row
        }
      });

      // Optional: Flip the arrow icon
      if (icon) {
        icon.textContent = icon.textContent === '▼' ? '▶' : '▼';
      }
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

  vscode.postMessage({
    command: "run_build",
    ignore_sources: ignore_sources,
    ignore_sources_cmd: ignore_sources_cmd
  });
}


//--function handleHowdyClick() {
function show_log(log_type: string, e: Element) {
  const level: string = e.getAttribute('level') || '';
  const source: string = e.getAttribute('source') || '';
  const cmd_index: number = Number(e.getAttribute('cmd_index'));

  vscode.postMessage({
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

  vscode.postMessage({
    command: "open_file",
    source: source
  });
}
