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

  const elements = document.getElementsByClassName("controller_refresh");

  for (let i = 0; i < elements.length; i++) {
    elements[i].addEventListener("click", controller_refresh);
  }

  const run_build_button = document.getElementById("run_build") as Button;
  run_build_button?.addEventListener("click", run_build);

  const run_single_build_button = document.getElementById("run_single_build") as Button;
  run_single_build_button?.addEventListener("click", run_single_build);
  
  const show_changes_button = document.getElementById("show_changes") as Button;
  show_changes_button?.addEventListener("click", show_changes);
  
  const show_single_changes_button = document.getElementById("show_single_changes") as Button;
  show_single_changes_button?.addEventListener("click", show_single_changes);
  
  const cancel_show_changes_button = document.getElementById("cancel_show_changes") as Button;
  cancel_show_changes_button?.addEventListener("click", cancel_show_changes);
  
  window.addEventListener('message', receive_message);

}


function run_build() {

  const run_build_ring = document.getElementById("run_build_ring");
  if (run_build_ring)
    run_build_ring.style.visibility='visible';

  vscode.postMessage({
    command: "run_build"
  });
}

function run_single_build() {

  const run_build_ring = document.getElementById("run_build_ring");
  if (run_build_ring)
    run_build_ring.style.visibility='visible';

  vscode.postMessage({
    command: "run_single_build"
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

function show_single_changes() {

  const show_changes_ring = document.getElementById("show_changes_ring");
  if (show_changes_ring)
    show_changes_ring.style.visibility='visible';
  
  vscode.postMessage({
    command: "show_single_changes"
  });
}

//--function handleHowdyClick() {
function cancel_show_changes() {

  vscode.postMessage({
    command: "cancel_show_changes"
  });
}

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


