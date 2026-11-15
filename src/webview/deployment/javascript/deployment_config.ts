import { page_text, showAlert } from "../../tools/javascript/alertBox";
import { typed_post } from "../../tools/javascript/post";
import type { DeploymentConfigRequest } from "../../../shared/messages/DeploymentMessages";


const vscode = acquireVsCodeApi();
const post = typed_post<DeploymentConfigRequest>(vscode);

window.addEventListener("load", main);


function main() {
  document.getElementById("save_config")?.addEventListener("click", save_config);
  document.getElementById("delete_auth_token")?.addEventListener("click", () => post({ command: "delete_auth_token" }));

  // "Unsaved changes" as soon as a value changes
  document.querySelector('main')?.addEventListener('input', () => {
    const dirty = document.getElementById('cfg_dirty');
    if (dirty)
      dirty.hidden = false;
  });

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
      'project': value('i-releaser|project'),
      'run-stages': value('i-releaser|run-stages').split('\n'),
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


