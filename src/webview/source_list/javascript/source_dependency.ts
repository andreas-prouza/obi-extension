import "../../tools/javascript/toolkit";
import {
  Button,
  TextField
} from "@vscode/webview-ui-toolkit";

import { page_text, showAlert } from "../../tools/javascript/alertBox";
import { init_source_select } from "../../tools/javascript/sourceSelect";
import { typed_post } from "../../tools/javascript/post";
import type { SourceDependencyRequest } from "../../../shared/messages/SourceConfigMessages";



const vscode = acquireVsCodeApi();
const post = typed_post<SourceDependencyRequest>(vscode);

window.addEventListener("load", main);



function main() {

  init_source_select('source_list_1');
  init_source_select('source_list_2');

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

  showAlert(page_text('obi_text_reloaded', 'Configuration reloaded.'), 'success');
}




function delete_dependency(type: 1 | 2, id: string) {
  
  const button = document.getElementById(id);
  const source: string|null|undefined = button?.getAttribute('source');


  post({
    command: `delete_dependency_${type}`,
    source: source ?? ''
  });
  reload();

}


function add_dependency_1() {
  
  const new_source: string = (document.getElementById("source_list_1") as TextField).value;

  add_dependency(1, new_source);
}


function add_dependency_2() {

  const new_source: string = (document.getElementById("source_list_2") as TextField).value;

  add_dependency(2, new_source);
}


function add_dependency(type: 1 | 2, source: string) {


  if (source.trim() == "") {
    showAlert(page_text('obi_text_choose_source', 'Please choose a source.'), 'info');
    return;
  }

  post({
    command: `add_dependency_${type}`,
    source: source.trim()
  });
  reload();
  
}






function reload() {
  post({
    command: "reload"
  });
}


function receive_message(e: MessageEvent) {

  switch (e.data.command) {

    case 'run_finished':
 
      break;

  }
}
