import "../../tools/javascript/toolkit";
import {
  Button
} from "@vscode/webview-ui-toolkit";

import { page_text, showAlert } from "../../tools/javascript/alertBox";
import { typed_post } from "../../tools/javascript/post";
import type { DeploymentConfigRequest } from "../../../shared/messages/DeploymentMessages";


const vscode = acquireVsCodeApi();
const post = typed_post<DeploymentConfigRequest>(vscode);

window.addEventListener("load", main);


function main() {
  // To get improved type annotations/IntelliSense the associated class for
  // a given toolkit component can be imported and used to type cast a reference
  // to the element (i.e. the `as Button` syntax)

  const btn_save_config = document.getElementById("save_config") as Button;
  btn_save_config?.addEventListener("click", save_config);

  const btn_delete_token = document.getElementById("delete_auth_token") as Button;
  btn_delete_token?.addEventListener("click", () => post({ command: "delete_auth_token" }));

  window.addEventListener('message', receive_message);

  showAlert(page_text('obi_text_reloaded', 'Configuration reloaded.'), 'success');
}



function save_config() {

  const value = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
  const data = {
    'i-releaser': {
      'url': value('i-releaser|url'),
      'default-workflow': value('i-releaser|default-workflow'),
      'workflows': value('i-releaser|workflows').split('\n'),
      'main-branch': value('i-releaser|main-branch'),
      'auth-token': value('i-releaser|auth-token')
    }
  };

  post({
    command: "save",
    data: data
  });
}


function receive_message(e: MessageEvent) {

  switch (e.data.command) {

    case '':
      
      break;

  }
}


