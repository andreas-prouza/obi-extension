import {
  allComponents,
  provideVSCodeDesignSystem,
  Button,
  TextField
} from "@vscode/webview-ui-toolkit";

// In order to use all the Webview UI Toolkit web components they
// must be registered with the browser (i.e. webview) using the
// syntax below.
provideVSCodeDesignSystem().register(allComponents);

const vscode = acquireVsCodeApi();

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

  showAlert('Configuration reloaded.');
}


function showAlert(text: string) {
  const box = document.getElementById('alertBox');
  box.textContent = text;
  box.style.display = 'block';
  setTimeout(() => box.style.display = 'none', 2000);
}



function add_source_setting() {
  
  save_config();

  const key:string = (document.getElementById("new_source_setting_key") as TextField).value;
  const value:string = (document.getElementById("new_source_setting_value") as TextField).value;
  const type:string = (document.getElementById("new_source_setting_type") as HTMLSelectElement).value;


  console.log(`add_source_setting: ${key} : ${value} : ${type}`);
  vscode.postMessage({
    command: "add_source_setting",
    key: key,
    value: value,
    type: type
  });

  reload();

}



function delete_source_setting(key:string) {
  
  save_config();

  console.log(`delete_source_setting: ${key}`);
  vscode.postMessage({
    command: "delete_source_setting",
    key: key
  });

  reload();

}



function add_source_cmd() {
  
  save_config();

  const key:string = (document.getElementById("new_source_cmd_key") as TextField).value;
  const value:string = (document.getElementById("new_source_cmd_value") as TextField).value;
  console.log(`New command ${key}: ${value}`);

  vscode.postMessage({
    command: "add_source_cmd",
    key: key,
    value: value
  });

  reload();
}




function delete_source_cmd(key:string) {
  
  save_config();

  console.log(`delete_source_cmd: ${key}`);
  vscode.postMessage({
    command: "delete_source_cmd",
    key: key
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


type SourceSettings = {
  [key: string]: string
}

type SourceCmds = {
  [key: string]: string
}


function save_config() {

  let app_elements = document.getElementsByClassName(`save_source_setting`);
  let source_settings: SourceSettings = {};

  console.log(`save_source_setting: ${app_elements.length}`);
  let key = '';
  let value = '';

  for (let i = 0; i < app_elements.length; i++) {
    key = app_elements[i].getAttribute('key') || 'undefined';

    switch (app_elements[i].constructor.name) {

      case 'TextArea2':
        value = Array.from((app_elements[i] as HTMLTextAreaElement).value.split('\n'));
        break;

      default:
        value = (app_elements[i] as TextField).value;
        break;
    }
    source_settings[key] = value;
  }

  app_elements = document.getElementsByClassName(`save_source_cmd`);
  let source_cmds: SourceCmds = {};

  console.log(`save_source_cmd: ${app_elements.length}`);
  for (let i = 0; i < app_elements.length; i++) {
    const key = app_elements[i].getAttribute('key') || 'undefined';
    const value = (app_elements[i] as TextField).value;
    source_cmds[key] = value;
  }

  console.log(`steps: ${document.getElementById("steps")}`);
  const steps_value: string = (document.getElementById("steps") as TextField).value
  let steps:string[] = [];
  if (steps_value.length > 0) 
    steps = steps_value.split('\n');

  vscode.postMessage({
    command: "save_config",
    settings: source_settings,
    source_cmds: source_cmds,
    steps: steps
  });
  
}