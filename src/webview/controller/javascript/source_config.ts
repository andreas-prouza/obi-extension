import "../../tools/javascript/toolkit";
import {
  Button,
  TextField
} from "@vscode/webview-ui-toolkit";

import { page_text, showAlert } from "../../tools/javascript/alertBox";
import { typed_post } from "../../tools/javascript/post";
import type { SourceConfigRequest } from "../../../shared/messages/SourceConfigMessages";


const vscode = acquireVsCodeApi();
const post = typed_post<SourceConfigRequest>(vscode);

window.addEventListener("load", main);



function main() {

  let button = document.getElementById("save_config") as Button;
  button?.addEventListener("click", save_config);
  
  button = document.getElementById("add_source_setting") as Button;
  button?.addEventListener("click", add_source_setting);
  
  let app_elements = document.getElementsByClassName(`delete_source_setting`);
  for (let i = 0; i < app_elements.length; i++) {
    const key = app_elements[i].getAttribute('key') || '';
    app_elements[i].addEventListener('click', () => {delete_source_setting(key);});
  }

  button = document.getElementById("add_source_cmd") as Button;
  button?.addEventListener("click", add_source_cmd);  

  app_elements = document.getElementsByClassName(`delete_source_cmd`);
  for (let i = 0; i < app_elements.length; i++) {
    const key = app_elements[i].getAttribute('key') || '';
    app_elements[i].addEventListener('click', () => {delete_source_cmd(key);});
  }

  window.addEventListener('message', receive_message);

  showAlert(page_text('obi_text_reloaded', 'Configuration reloaded.'), 'success');
}




function add_source_setting() {
  
  save_config();

  const key:string = (document.getElementById("new_source_setting_key") as TextField).value;
  const value:string = (document.getElementById("new_source_setting_value") as TextField).value;
  const type:string = (document.getElementById("new_source_setting_type") as HTMLSelectElement).value;


  post({
    command: "add_source_setting",
    key: key,
    value: value,
    type: type
  });

  reload();

}



function delete_source_setting(key:string) {
  
  save_config();

  post({
    command: "delete_source_setting",
    key: key
  });

  reload();

}



function add_source_cmd() {
  
  save_config();

  const key:string = (document.getElementById("new_source_cmd_key") as TextField).value;
  const value:string = (document.getElementById("new_source_cmd_value") as TextField).value;

  post({
    command: "add_source_cmd",
    key: key,
    value: value
  });

  reload();
}




function delete_source_cmd(key:string) {
  
  save_config();

  post({
    command: "delete_source_cmd",
    key: key
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


type SourceSettings = {
  [key: string]: string | string[]
}

type SourceCmds = {
  [key: string]: string
}


function save_config() {

  let app_elements = document.getElementsByClassName(`save_source_setting`);
  let source_settings: SourceSettings = {};

  let key = '';
  let value: string | string[] = '';

  for (let i = 0; i < app_elements.length; i++) {
    key = app_elements[i].getAttribute('key') || 'undefined';
    const type = app_elements[i].getAttribute('data-type') || 'string';


    switch (type) {

      case 'list':
        value = Array.from((app_elements[i] as HTMLTextAreaElement).value.split(/\r?\n/));
        break;

      default:
        value = (app_elements[i] as TextField).value;
        break;
    }
    source_settings[key] = value;
  }

  app_elements = document.getElementsByClassName(`save_source_cmd`);
  let source_cmds: SourceCmds = {};

  for (let i = 0; i < app_elements.length; i++) {
    const key = app_elements[i].getAttribute('key') || 'undefined';
    const value = (app_elements[i] as TextField).value;
    source_cmds[key] = value;
  }

  const steps_value: string = (document.getElementById("steps") as TextField).value
  let steps:string[] = [];
  if (steps_value.length > 0) 
    steps = steps_value.split('\n');

  post({
    command: "save_config",
    settings: source_settings,
    source_cmds: source_cmds,
    steps: steps
  });
  
}