import {
  allComponents,
  provideVSCodeDesignSystem,
  Checkbox,
  DataGrid,
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

  const save_button = document.getElementById("save_config") as Button;
  save_button?.addEventListener("click", save_configs);

  window.addEventListener('message', receive_message);

}


function save_configs() {
  save_config('project');
  save_config('user');
}


function save_config(class_prefix:string) {

  let global_config:{} = {};
  let app_config:{} = {};

  const global_elements = document.getElementsByClassName(`${class_prefix}_save_global`);
  for (let i = 0; i < global_elements.length; i++) {
    global_config[global_elements[i].id] = global_elements[i].value;
  }

  const app_elements = document.getElementsByClassName(`${class_prefix}_save_app`);
  let json_string: string = '';

  for (let i = 0; i < app_elements.length; i++) {
    
    let item = {};
    const el2: [] = app_elements[i].id.split('|');

    json_string = '';

    for (let i=0; i < el2.length; i++) {
      if (i > 0)
        json_string = `${json_string} :`;
      json_string = `${json_string} { "${el2[i]}"`;
    }

    const elem_value = app_elements[i].value.replaceAll('\\', '\\\\').replaceAll('"', '\\\"');

    // Standard element
    let json_value = `"${elem_value.replaceAll('\n', '\\n')}"`;

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
    for (let i = 0; i < el2.length; i++) {
      json_string = `${json_string} }`;
    }

    item = JSON.parse(json_string);
    app_config = deepmerge(app_config, item);
    //app_config[app_elements[i].id] = app_elements[i].value;
  }

  console.log(app_config);

  vscode.postMessage({
    command: `${class_prefix}_save`,
    data: {
      global: global_config,
      app: app_config
    }
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


