import {
  allComponents,
  provideVSCodeDesignSystem,
  Button,
  TextField
} from "@vscode/webview-ui-toolkit";

import * as source from '../../../obi/Source';
import { showAlert } from "../../tools/javascript/alertBox";

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

  const save_button = document.getElementById("save_config") as Button;
  save_button?.addEventListener("click", save_config);


  showAlert('Configuration reloaded.', 'success');
}



function save_config() {

  let sources: source.ISourceInfos = {};
  let els  = document.getElementsByClassName('source_description');
  let lib: string|null = '';
  let file: string|null = '';
  let member: string|null = '';

  for (let i=0; i < els.length; i++) {

    const el = els[i];

    lib = el.getAttribute('lib');
    file = el.getAttribute('file');
    member = el.getAttribute('member');
    console.log(`${lib} - ${file} - ${member}: ${(el as TextField).value}`);

    const full_name = `${lib||'UNKNOWN'}/${file||'UNKNOWN'}/${member||'UNKNOWN'}`;
    sources[full_name] = {description: (el as TextField).value};
  }

  vscode.postMessage({
    command: 'save_config',
    data: sources
  });

}

