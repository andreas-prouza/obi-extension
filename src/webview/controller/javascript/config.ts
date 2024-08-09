import {
  allComponents,
  provideVSCodeDesignSystem,
  Checkbox,
  DataGrid,
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

  const save_button = document.getElementById("save_config") as Button;
  save_button?.addEventListener("click", save_config);

  window.addEventListener('message', receive_message);

}


function save_config() {

  let global_config:{} = {};
  let app_config:{} = {};

  const global_elements = document.getElementsByClassName("save_global");
  for (let i = 0; i < global_elements.length; i++) {
    global_config[global_elements[i].id] = global_elements[i].value;
  }

  const app_elements = document.getElementsByClassName("save_app");
  for (let i = 0; i < app_elements.length; i++) {
    const el2: [] = app_elements[i].value.split('.');
    let item: string = `{${el2[0]}`;
    let tmp: {} = {};
    for (let i = 1; i < el2.length; i++) {
      item = `${item} : { ${el2[i]}`;
    }
    for (let i = 1; i < el2.length; i++) {
      item = `${item} }`;
    }
    //app_config[app_elements[i].id] = app_elements[i].value;
  }

  vscode.postMessage({
    command: "save",
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

