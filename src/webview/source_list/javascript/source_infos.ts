import {
  allComponents,
  provideVSCodeDesignSystem,
  Button,
  TextField
} from "@vscode/webview-ui-toolkit";

import * as source from '../../../obi/Source';

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

  window.addEventListener('message', receive_message);

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
    if (lib == '')
      lib = '.*';
    
    file = el.getAttribute('file');
    if (file == '')
      file = '.*';
    
    member = el.getAttribute('member');
    if (member == '')
      member = '.*';

    const full_name = `${lib||'UNKNOWN'}/${file||'UNKNOWN'}/${member||'UNKNOWN'}`;
    sources[full_name] = {description: (el as TextField).value};
  }

  vscode.postMessage({
    command: 'save_config',
    data: sources
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


