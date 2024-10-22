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

  window.addEventListener('message', receive_message);

}



function receive_message(e: MessageEvent) {

  switch (e.data.command) {

    case 'run_finished':
 
      break;

  }
}


