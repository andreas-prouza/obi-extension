import "../../tools/javascript/toolkit";
import {
  Button
} from "@vscode/webview-ui-toolkit";
import { typed_post } from "../../tools/javascript/post";
import type { ConfigInvalidRequest } from "../../../shared/messages/StartMessages";


const vscode = acquireVsCodeApi();
const post = typed_post<ConfigInvalidRequest>(vscode);

window.addEventListener("load", main);

function main() {
  // To get improved type annotations/IntelliSense the associated class for
  // a given toolkit component can be imported and used to type cast a reference
  // to the element (i.e. the `as Button` syntax)


  const btn_initialize_folder = document.getElementById("initialize_folder") as Button;
  btn_initialize_folder?.addEventListener("click", initialize_folder);

  const btn_reload_workspace = document.getElementById("reload_workspace") as Button;
  btn_reload_workspace?.addEventListener("click", reload_workspace);
  
  const btn_config = document.getElementById("config") as Button;
  btn_config?.addEventListener("click", config);
  
  window.addEventListener('message', receive_message);

}


function config() {

  post({
    command: "config"
  });
}

function initialize_folder() {

  post({
    command: "initialize_folder"
  });
}


function reload_workspace() {

  post({
    command: "reload_workspace"
  });
}



function receive_message(e: MessageEvent) {

  switch (e.data.command) {

    case '':
      
      break;

  }
}


