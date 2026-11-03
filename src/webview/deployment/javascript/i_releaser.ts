import "../../tools/javascript/toolkit";
import {
  Button
} from "@vscode/webview-ui-toolkit";
import { typed_post } from "../../tools/javascript/post";
import type { IReleaserRequest } from "../../../shared/messages/DeploymentMessages";


const vscode = acquireVsCodeApi();
const post = typed_post<IReleaserRequest>(vscode);

window.addEventListener("load", main);


function main() {
  // To get improved type annotations/IntelliSense the associated class for
  // a given toolkit component can be imported and used to type cast a reference
  // to the element (i.e. the `as Button` syntax)

  const btn_initialize_folder = document.getElementById("open_web_app") as Button;
  btn_initialize_folder?.addEventListener("click", open_web_app);
  
  window.addEventListener('message', receive_message);

}


function open_web_app() {

  post({
    command: "open_web_app"
  });
}


function receive_message(e: MessageEvent) {

  switch (e.data.command) {

    case '':
      
      break;

  }
}


