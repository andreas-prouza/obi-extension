import {
  allComponents,
  provideVSCodeDesignSystem,
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

  const btn_save_config = document.getElementById("save_config") as Button;
  btn_save_config?.addEventListener("click", save_config);
  
  window.addEventListener('message', receive_message);

  showAlert('Configuration reloaded.');
}


function showAlert(text: string) {
  const box = document.getElementById('alertBox');
  box.textContent = text;
  box.style.display = 'block';
  setTimeout(() => box.style.display = 'none', 2000);
}



function save_config() {
  console.log('Save deployment config');

  let data = {'i-releaser' : {}};

  data['i-releaser']['url'] = (document.getElementById('i-releaser|url') as HTMLInputElement).value;
  data['i-releaser']['default-workflow'] = (document.getElementById('i-releaser|default-workflow') as HTMLInputElement).value;
  data['i-releaser']['main-branch'] = (document.getElementById('i-releaser|main-branch') as HTMLInputElement).value;
  data['i-releaser']['auth-token'] = (document.getElementById('i-releaser|auth-token') as HTMLInputElement).value;

  console.log('Save deployment config');
  vscode.postMessage({
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


