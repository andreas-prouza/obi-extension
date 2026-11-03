import "../../tools/javascript/toolkit";
import {
  Button
} from "@vscode/webview-ui-toolkit";
import { typed_post } from "../../tools/javascript/post";
import type { WelcomeRequest } from "../../../shared/messages/StartMessages";


const vscode = acquireVsCodeApi();
const post = typed_post<WelcomeRequest>(vscode);

window.addEventListener("load", main);


function main() {
  // To get improved type annotations/IntelliSense the associated class for
  // a given toolkit component can be imported and used to type cast a reference
  // to the element (i.e. the `as Button` syntax)

  const btn_initialize_folder = document.getElementById("initialize_folder") as Button;
  btn_initialize_folder?.addEventListener("click", initialize_folder);
  
  const btn_open_folder = document.getElementById("open_folder") as Button;
  btn_open_folder?.addEventListener("click", open_folder);
  
  const btn_reload_window = document.getElementById("reload_window") as Button;
  btn_reload_window?.addEventListener("click", reload_window);
  
  window.addEventListener('message', receive_message);

}


function initialize_folder() {

  post({
    command: "initialize_folder"
  });
}


function reload_window() {

  post({
    command: "reload_window"
  });
}


function open_folder() {

  post({
    command: "open_folder"
  });
}


function receive_message(e: MessageEvent) {

  switch (e.data.command) {

    case '':
      
      break;

  }
}


