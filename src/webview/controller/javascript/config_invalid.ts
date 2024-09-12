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


  const btn_initialize_folder = document.getElementById("initialize_folder") as Button;
  btn_initialize_folder?.addEventListener("click", initialize_folder);

  const btn_reload_workspace = document.getElementById("reload_workspace") as Button;
  btn_reload_workspace?.addEventListener("click", reload_workspace);
  
  const btn_config = document.getElementById("config") as Button;
  btn_config?.addEventListener("click", config);
  
  window.addEventListener('message', receive_message);

}


function config() {

  vscode.postMessage({
    command: "config"
  });
}

function initialize_folder() {

  vscode.postMessage({
    command: "initialize_folder"
  });
}


function reload_workspace() {

  vscode.postMessage({
    command: "reload_workspace"
  });
}



function receive_message(e: MessageEvent) {

  switch (e.data.command) {

    case '':
      
      break;

  }
}


