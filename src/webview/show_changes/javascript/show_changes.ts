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

window.addEventListener("load", main);

function main() {
  // To get improved type annotations/IntelliSense the associated class for
  // a given toolkit component can be imported and used to type cast a reference
  // to the element (i.e. the `as Button` syntax)

  const joblogButton = document.getElementsByClassName("joblog");

  for (let i = 0; i < joblogButton.length; i++) {
    joblogButton[i].addEventListener("click", function () {show_log('joblog');});
  }
  
  const splfButton = document.getElementsByClassName("stdout");

  for (let i = 0; i < splfButton.length; i++) {
    splfButton[i].addEventListener("click", function () {show_log('stdout');});
  }
  const errorButton = document.getElementsByClassName("stderr");

  for (let i = 0; i < errorButton.length; i++) {
    errorButton[i].addEventListener("click", function () {show_log('stderr');});
  }

}



//--function handleHowdyClick() {
function show_log(log_type: string) {
  const level: string = (document.getElementById('level') as HTMLInputElement).value;
  const source: string = (document.getElementById('source') as HTMLInputElement).value;
  const cmd_index: number = Number((document.getElementById('cmd_index') as HTMLInputElement).value);

  vscode.postMessage({
    command: "show_log",
    type: log_type,
    level: level,
    cmd_index: cmd_index,
    source: source
  });
}
