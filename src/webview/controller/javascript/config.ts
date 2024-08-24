import {
  allComponents,
  provideVSCodeDesignSystem,
  Button
} from "@vscode/webview-ui-toolkit";

const deepmerge = require('deepmerge');

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

  console.log('Main ...');

  check_inputs();

  const save_button = document.getElementById("save_config") as Button;
  save_button?.addEventListener("click", save_configs);

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

  window.addEventListener('message', receive_message);

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
      password: ssh_password.value
    });

}



function check_missing_hint() {
  const missing_elements = document.getElementsByClassName('missing_value');
  let missing_el: HTMLDivElement = document.getElementById('still_missing') as HTMLDivElement;

  if (missing_elements.length > 0)
    missing_el.style.visibility = "visible";
  else
    missing_el.style.visibility = "hidden";
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




function save_config(class_prefix:string) {

  let app_config:{} = {};


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

    // Standard element
    let json_value = `"${elem_value.replaceAll('\n', '\\n')}"`;
    
    // Checkbox element
    if (app_elements[i].classList.contains('type_checkbox')) {
      json_value = '"false"';
      if (app_elements[i].checked)
        json_value = '"true"';
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
    data: app_config
  });
}


function show_changes() {

  const show_changes_ring = document.getElementById("show_changes_ring");
  if (show_changes_ring)
    show_changes_ring.style.visibility='visible';
  
  vscode.postMessage({
    command: "show_changes"
  });
}

//--function handleHowdyClick() {
function controller_refresh() {

  vscode.postMessage({
    command: "refresh"
  });
}



function receive_message(e: MessageEvent) {

  switch (e.data.command) {

    case 'run_finished':
      const show_changes_ring = document.getElementById("show_changes_ring");
      if (show_changes_ring)
        show_changes_ring.style.visibility='hidden';

      const run_build_ring = document.getElementById("run_build_ring");
      if (run_build_ring)
        run_build_ring.style.visibility='hidden';
      
      break;

    case 'update_build_summary_timestamp':

      let visibility = 'visible';
      if (!e.data.build_counts || e.data.build_counts == 0)
        visibility = 'hidden';

      let open_build_summary = document.getElementById("open_build_summary");
      if (open_build_summary)
        open_build_summary.style.visibility=visibility;

      let build_summary_timestamp_label = document.getElementById("build_summary_timestamp");
      if (build_summary_timestamp_label) {
        build_summary_timestamp_label.innerHTML = ` (${e.data.build_summary_timestamp})`;
        build_summary_timestamp_label.style.visibility=visibility;
      }
      break;
  }
}


