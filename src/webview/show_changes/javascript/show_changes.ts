import {
  allComponents,
  provideVSCodeDesignSystem,
  Checkbox,
  DataGrid,
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

}


function run_build() {
  vscode.postMessage({
    command: "run_build"
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
