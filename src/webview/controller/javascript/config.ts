import {
  allComponents,
  provideVSCodeDesignSystem,
  Button,
  TextField
} from "@vscode/webview-ui-toolkit";

import { showAlert } from "../../tools/javascript/alertBox";

const deepmerge = require('deepmerge');

// In order to use all the Webview UI Toolkit web components they
// must be registered with the browser (i.e. webview) using the
// syntax below.
provideVSCodeDesignSystem().register(allComponents);

const vscode = acquireVsCodeApi();

window.addEventListener("load", main);
//document.addEventListener('DOMContentLoaded', main, false);


let panel: string|null;
let panel_tab: string|null;



function main() {

  console.log('Main ...');

  check_inputs();

  const save_button = document.getElementById("save_config") as Button;
  save_button?.addEventListener("click", save_configs);

  const project_cfg_button = document.getElementById("project_cfg");
  project_cfg_button?.addEventListener("click", () => {panel = 'project_cfg'});
  const user_cfg_button = document.getElementById("user_cfg");
  user_cfg_button?.addEventListener("click", () => {panel = 'user_cfg'});
  const source_cfg_button = document.getElementById("source_cfg");
  source_cfg_button?.addEventListener("click", () => {panel = 'source_cfg'});

  console.log(`Panel: ${panel}, panel_tab: ${panel_tab}`);
  const panel_tab_buttons = document.getElementsByClassName('panel_tab');
  for (let i = 0; i < panel_tab_buttons.length; i++) {
    panel_tab_buttons[i].addEventListener("click", () => {panel_tab=panel_tab_buttons[i].id.replace('project_', '').replace('user_', '')});
  }

  let button = document.getElementById("add_global_cmd") as Button;
  button?.addEventListener("click", () => {
    add_global_cmd(button);
    reload();
  });

  let buttons = document.getElementsByClassName('delete_global_cmd');
  for (let i = 0; i < buttons.length; i++) {
    const el = buttons[i];
    el.addEventListener("click", () => {
      delete_global_cmd(el.getAttribute('project_user'), el.getAttribute('key')?.split('|')[2]); 
      reload();
    });
  }


  button = document.getElementById("add_compile_cmd") as Button;
  button?.addEventListener("click", () => {
    add_compile_cmd(button);
    reload();
  });


  buttons = document.getElementsByClassName('delete_compile_cmd');
  for (let i = 0; i < buttons.length; i++) {
    const el = buttons[i];
    el.addEventListener("click", () => {
      delete_compile_cmd(el.getAttribute('project_user'), el.getAttribute('key')?.split('|')[2]); 
      reload();
    });
  }


  button = document.getElementById("add_global_step") as Button;
  button?.addEventListener("click", () => {
    add_global_step(button);
    reload();
  });

  buttons = document.getElementsByClassName('delete_global_step');
  for (let i = 0; i < buttons.length; i++) {
    const el = buttons[i];
    el.addEventListener("click", () => {
      delete_global_step(el.getAttribute('project_user'), el.getAttribute('key')?.split('|')[2]); 
      reload();
    });
  }


  // Add new attributes for language settings
  const new_language_button = document.getElementById('add_language_settings');
  new_language_button?.addEventListener('click', () => {
    const lang: string = document.getElementById('add_language_settings_name')?.value;
    const config: string = new_language_button.getAttribute('config') ?? '';
    add_language_settings(config, lang);
    reload();
  });

  const new_property_buttons = document.getElementsByName(`language-settings-add-property`);
  new_property_buttons.forEach((e) => {
    e.addEventListener('click', () => {
      const attr: string = e.getAttribute('id_of_property') ?? '';
      const value: string = document.getElementById(attr)?.value;
      const config: string = e.getAttribute('config') ?? '';
      const attr_arr = attr.split('|');
      add_language_attribute(config, attr_arr[0], value);
      reload();
    });
  });


  const app_elements = document.getElementsByTagName(`vscode-text-field`);
  
  for (let i = 0; i < app_elements.length; i++) {

    if (app_elements[i].getAttribute('regex_validator'))
      app_elements[i]?.addEventListener('change', () => {
        vaidate(app_elements[i] as HTMLInputElement);
      });

    if (!app_elements[i]?.classList.contains('mandatory'))
      continue;

    app_elements[i]?.addEventListener('change', () => {
      check_input(app_elements[i]);
      check_missing_hint();

      const panel = app_elements[i].getAttribute('panel');
      if (!panel)
        return;
      check_panel_missing(panel);
    } );

  }

  $('#config_source_list').on('post-body.bs.table', function (name, args) {
    let buttons = document.getElementsByClassName('edit_source_config');
    console.log(`source configs: ${buttons.length}`);
    for (let i = 0; i < buttons.length; i++) {
      const el = buttons[i] as Button;
      console.log(`Add click source config2: ${el.id}`);
      el.addEventListener("click", () => {
        edit_source_config(el.getAttribute('key'));
      });
    }

    buttons = document.getElementsByClassName('delete_source_config');
    for (let i = 0; i < buttons.length; i++) {
      const el = buttons[i];
      el.addEventListener("click", () => {
        delete_source_config(el.getAttribute('key')); 
        reload();
      });
    }
  
  });


  const add_source_config_button = document.getElementById('add_source_config') as Button;
  add_source_config_button.addEventListener("click", add_source_config);


  window.addEventListener('message', receive_message);

  check_error_text();
  
  // Show configuration loaded message in the UI instead of alert
  showAlert('Configuration reloaded.', 'success');
}



function edit_source_config(key: string|null) {

  console.log(`Edit source config: ${key}`);
  vscode.postMessage({
    command: "edit_source_config",
    source: key
  });

}

function add_source_config() {
  const lib:string = (document.getElementById("new_lib") as TextField).value;
  const file:string = (document.getElementById("new_file") as TextField).value;
  const member:string = (document.getElementById("new_member") as TextField).value;

  console.log(`Add source config: ${lib} / ${file} / ${member}`);
  vscode.postMessage({
    command: "add_source_config",
    panel: panel,
    panel_tab: panel_tab,
    source: `${lib}/${file}/${member}`
  });

}



function delete_source_config(key: string|null) {

  console.log(`delete_source_config: ${key}`);
  vscode.postMessage({
    command: "delete_source_config",
    panel: panel,
    panel_tab: panel_tab,
    source: key
  });

}



function delete_global_cmd(config: string, key: string) {
  
  save_config(config);

  console.log(`Delete command ${key} for ${config}`);

  vscode.postMessage({
    command: "delete_global_cmd",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config,
    key: key
  });

}



function delete_compile_cmd(config: string, key: string) {
  
  save_config(config);

  console.log(`Delete command ${key} for ${config}`);

  vscode.postMessage({
    command: "delete_compile_cmd",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config,
    key: key
  });

}



function delete_global_step(config: string, key: string) {
  
  save_config(config);

  console.log(`Delete command ${key} for ${config}`);

  vscode.postMessage({
    command: "delete_global_step",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config,
    key: key
  });

}


function add_global_cmd(e: HTMLElement) {
  
  const config: string = e.getAttribute('config') ?? '';

  save_config(config);

  const key = document.getElementById("new_global_cmd_key") as TextField;
  const value = document.getElementById("new_global_cmd_value") as TextField;
  console.log(`New command ${key.value}, ${value.value}`);

  vscode.postMessage({
    command: "add_global_cmd",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config,
    key: key.value,
    value: value.value
  });

}



function add_compile_cmd(e: HTMLElement) {
  
  const config: string = e.getAttribute('config') ?? '';

  save_config(config);

  const key = document.getElementById("new_compile_cmd_key") as TextField;
  const value = document.getElementById("new_compile_cmd_value") as TextField;
  console.log(`New command ${key.value}, ${value.value}`);

  vscode.postMessage({
    command: "add_compile_cmd",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config,
    key: key.value,
    value: value.value
  });

}


function add_global_step(e: HTMLElement) {
  
  const config: string = e.getAttribute('config') ?? '';

  save_config(config);

  const key = document.getElementById("new_global_step_key") as TextField;
  const value = document.getElementById("new_global_step_value") as TextField;
  console.log(`New command ${key.value}, ${value.value}`);

  vscode.postMessage({
    command: "add_global_step",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config,
    key: key.value,
    value: value.value
  });

}




function add_language_attribute(class_prefix: string, language: string, attribute: string) {
  
  save_config(class_prefix);
  console.log(`saved ${language}, ${attribute}`);

  vscode.postMessage({
    command: "add_language_attribute",
    panel: panel,
    panel_tab: panel_tab,
    user_project: class_prefix,
    language: language,
    attribute: attribute
  });

}




function add_language_settings(class_prefix: string, language: string) {
  
  save_config(class_prefix);

  vscode.postMessage({
    command: "add_language_settings",
    panel: panel,
    panel_tab: panel_tab,
    user_project: class_prefix,
    language: language
  });

}




function vaidate (element: HTMLInputElement): void {
  
  const attr: string|null = element.getAttribute('regex_validator');
  const hint = (document.getElementById(`hint_${element.id}`) as HTMLLabelElement);
  hint.style.visibility = "hidden";

  if (attr && element.value.length > 0) {
    const reg = new RegExp(attr);
    console.log(`Test ${element.id}: ${reg.test(element.value)}`);
    if (!reg.test(element.value)){
      element.value = '';
      hint.style.visibility = "visible";
    }
  }
}


function save_configs() {

  // save even if it's not all finished

  save_config('project');
  save_config('user');

  const ssh_password = document.getElementById("user|SSH_PASSWORD") as HTMLInputElement;
  if (ssh_password.value.length > 0)
    vscode.postMessage({
      command: `save_ssh_password`,
      panel: panel,
      panel_tab: panel_tab,
      password: ssh_password.value
    });

  reload();

}



function check_missing_hint() {
  const missing_elements = document.getElementsByClassName('missing_value');
  let missing_el: HTMLDivElement = document.getElementById('still_missing') as HTMLDivElement;

  if (missing_elements.length > 1)
    missing_el.style.display = "";
  else
    missing_el.style.display = "none";
}


function check_error_text() {
  let error_el: HTMLDivElement = document.getElementById('error_text') as HTMLDivElement;

  if (error_el.getAttribute('show') === 'true')
    error_el.style.display = "";
  else
    error_el.style.display = "none";
}



function check_panel_missing(panel: string) {

  const panel_el = document.getElementById(panel);
  const missing_elements = document.getElementsByClassName('missing_value');
  let found: boolean = false;

  for (let i = 0; i < missing_elements.length; i++) {
    const el = missing_elements[i];
    if (el.getAttribute('panel') != panel)
      continue;
    found = true;
  }

  if (!found) {
    panel_el?.classList.remove('missing_value');
    return;
  }

  if (!panel_el?.classList.contains('missing_value'))
    panel_el?.classList.add('missing_value');
  return;
}



function check_input(element: Element) {

  element.classList.remove('missing_value');

  const elem_value: string = element.value;
  let found_missing = false;

  // Array
  if (element.classList.contains('type_array')) {
    const list_values = elem_value.split('\n');

    found_missing = true;
    for (let i=0; i < list_values.length; i++) {
      
      if (list_values[i].length == 0)
        continue;
      found_missing = false;
      break;
    }

    if (found_missing) {
      set_element_missing_value(element);
      return;
    }
    return;
  }

  // Dictionary
  if (element.classList.contains('type_dict')) {
    const list_values = elem_value.split('\n');

    found_missing = true;
    for (let i=0; i < list_values.length; i++) {
      if (list_values[i].length == 0)
        continue;

      found_missing = false;
      break;
    }

    if (found_missing) {
      set_element_missing_value(element);
      return;
    }
    return;
  }

  if (elem_value.length == 0) {
    set_element_missing_value(element);
  }
  
}



function check_inputs() {

  const elements = document.getElementsByClassName('mandatory');

  for (let i = 0; i < elements.length; i++) {
    check_input(elements[i]);
    const panel = elements[i].getAttribute('panel');
    if (!panel)
      return;
    check_panel_missing(panel);
  }

  check_missing_hint();
  return document.getElementsByClassName(`missing_value`).length == 0;

}




function set_element_missing_value(element: Element) {
  element.classList.add('missing_value');
  const panel = element.getAttribute('panel');
  const panel_el = document.getElementById(panel);
  if (!panel)
    return;
  if (!panel_el?.classList.contains('missing_value'))
    panel_el?.classList.add('missing_value');
}




function save_global_cmds(class_prefix:string) {

  const app_elements = document.getElementsByClassName(`${class_prefix}_save_app_global_cmds`);
  for (let i = 0; i < app_elements.length; i++) {
    
    const el2: string[] = app_elements[i].id.split('|');
    const key = el2[3];
    const value = (document.getElementById(`${class_prefix}|global|cmds|${key}|value`) as TextField).value;

    vscode.postMessage({
      command: `save_global_cmd`,
      panel: panel,
      panel_tab: panel_tab,
      user_project: class_prefix,
      key: key,
      value: value
    });

  }
}




function save_global_step(class_prefix:string) {

  const app_elements = document.getElementsByClassName(`${class_prefix}_save_app_global_step`);
  for (let i = 0; i < app_elements.length; i++) {
    
    const key = (document.getElementById(app_elements[i].id) as TextField).value;
    const value = (document.getElementById(`${class_prefix}|global|steps|${key}|value`) as TextField).value;

    vscode.postMessage({
      command: `save_global_step`,
      panel: panel,
      panel_tab: panel_tab,
      user_project: class_prefix,
      key: key,
      value: value
    });

  }
}



function save_compile_cmds(class_prefix:string) {

  const app_elements = document.getElementsByClassName(`${class_prefix}_save_app_compile_cmd`);
  for (let i = 0; i < app_elements.length; i++) {
    
    const el2: string[] = app_elements[i].id.split('|');
    const key = el2[3];
    const value = (document.getElementById(`${class_prefix}|global|compile-cmds|${key}|value`) as TextField).value;

    vscode.postMessage({
      command: `save_compile_cmd`,
      panel: panel,
      panel_tab: panel_tab,
      user_project: class_prefix,
      key: key,
      value: value
    });

  }
}


function reload() {
  vscode.postMessage({
    command: `reload`
  });
}



function save_config(class_prefix:string) {

  let app_config:{} = {};

  save_global_cmds(class_prefix);
  save_global_step(class_prefix);
  save_compile_cmds(class_prefix);

  const app_elements = document.getElementsByClassName(`${class_prefix}_save_app`);
  let json_string: string = '';

  for (let i = 0; i < app_elements.length; i++) {
    
    let item = {};
    const el2: string[] = app_elements[i].id.split('|');

    json_string = '';

    for (let i=1; i < el2.length; i++) {
      if (i > 1)
        json_string = `${json_string} :`;
      json_string = `${json_string} { "${el2[i]}"`;
    }

    const elem_value = app_elements[i].value.replaceAll('\\', '\\\\').replaceAll('"', '\\\"');

    if (elem_value.length == 0 || elem_value == 'NaN')
      continue;

    // Standard element
    let json_value = `"${elem_value.replaceAll('\n', '\\n')}"`;
    if (app_elements[i].getAttribute('type') == 'number') {
      json_value = elem_value;
    }
    
    // Checkbox element
    if (app_elements[i].classList.contains('type_checkbox')) {
      json_value = 'false';
      if (app_elements[i].checked)
        json_value = 'true';
    }

    // Array
    if (app_elements[i].classList.contains('type_array')) {
      json_value = '[';
      const list_values = elem_value.split('\n');

      for (let i=0; i < list_values.length; i++) {
        
        if (list_values[i].length == 0)
          continue;

        if (i > 0)
          json_value = `${json_value}, `;
        json_value = `${json_value} "${list_values[i]}"`;
      }
      json_value = `${json_value} ]`;
    }

    // Dictionary
    if (app_elements[i].classList.contains('type_dict')) {
      json_value = '{';
      const list_values = elem_value.split('\n');

      for (let i=0; i < list_values.length; i++) {
        if (list_values[i].length == 0)
          continue;

        if (i > 0)
          json_value = `${json_value}, `;
        json_value = `${json_value} "${list_values[i].split('=')[0].trim()}": "${list_values[i].split('=')[1].trim()}"`;
      }
      json_value = `${json_value} }`;
    }

    json_string = `${json_string} : ${json_value}`;

    // finally close the element
    for (let i = 1; i < el2.length; i++) {
      json_string = `${json_string} }`;
    }

    item = JSON.parse(json_string);
    app_config = deepmerge(app_config, item);
    //app_config[app_elements[i].id] = app_elements[i].value;
  }

  console.log(app_config);

  vscode.postMessage({
    command: `${class_prefix}_save`,
    panel: panel,
    panel_tab: panel_tab,
    data: app_config
  });
}




function receive_message(e: MessageEvent) {

  switch (e.data.command) {
    
    case 'finished_saving_config':
      showAlert('Configuration reloaded.', 'success');
      break;
  }
}


