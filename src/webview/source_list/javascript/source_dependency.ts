import {
  allComponents,
  provideVSCodeDesignSystem,
  Button,
  TextField
} from "@vscode/webview-ui-toolkit";

import { showAlert } from "../../tools/javascript/alertBox";


// In order to use all the Webview UI Toolkit web components they
// must be registered with the browser (i.e. webview) using the
// syntax below.
provideVSCodeDesignSystem().register(allComponents);

const vscode = acquireVsCodeApi();

window.addEventListener("load", main);



function main() {

  let button = document.getElementById("add_dependency_1") as Button;
  button?.addEventListener("click", add_dependency_1);
  
  button = document.getElementById("add_dependency_2") as Button;
  button?.addEventListener("click", add_dependency_2);
  
  let delete_buttons = document.getElementsByClassName(`delete_dependency_1`);
  for (let i = 0; i < delete_buttons.length; i++) {
    const e = delete_buttons[i];
    e.addEventListener('click', () => {
        delete_dependency(1, e.id);
    });
  }
  
  delete_buttons = document.getElementsByClassName(`delete_dependency_2`);
  for (let i = 0; i < delete_buttons.length; i++) {
    const e = delete_buttons[i];
    e.addEventListener('click', () => {
        delete_dependency(2, e.id);
    });
  }

  window.addEventListener('message', receive_message);

  showAlert('Configuration reloaded.', 'success');
}




function delete_dependency(type: number, id: string) {
  
  const button = document.getElementById(id);
  let source: string|null|undefined = button?.getAttribute('source');

  console.log(`Delete dependency ${type} ${source}`);

  vscode.postMessage({
    command: `delete_dependency_${type}`,
    source: source
  });
  reload();

}


function add_dependency_1() {
  
  const new_source: string = (document.getElementById("new_source_1") as TextField).value;

  add_dependency(1, new_source);
}


function add_dependency_2() {

  const new_source: string = (document.getElementById("new_source_2") as TextField).value;

  add_dependency(2, new_source);
}


function add_dependency(type: number, source: string) {

  console.log(`Add dependency ${source}, type: ${type}`);

  if (source.trim() == "") {
    showAlert("Please choose a source.", "info");
    return;
  }

  vscode.postMessage({
    command: "add_dependency_" + type,
    source: source.trim()
  });
  reload();
  
}






function reload() {
  vscode.postMessage({
    command: "reload"
  });
}


function receive_message(e: MessageEvent) {

  switch (e.data.command) {

    case 'run_finished':
 
      break;

  }
}
