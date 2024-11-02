import {
  allComponents,
  provideVSCodeDesignSystem,
  Button
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

  const add_filter_button = document.getElementById("add_filter") as Button;
  add_filter_button?.addEventListener("click", add_filter);


  const delete_buttons = document.getElementsByClassName('delete_filter');
  
  for (let i = 0; i < delete_buttons.length; i++) {
    const e = delete_buttons[i];
    e.addEventListener('click', () => {
        delete_filter(e.id);
      });
  }

  window.addEventListener('message', receive_message);

}




function delete_filter(id: string) {
  
  const button = document.getElementById(id);
  let lib: string|null|undefined = button?.getAttribute('lib');
  let file: string|null|undefined = button?.getAttribute('file');
  let member: string|null|undefined = button?.getAttribute('member');

  console.log(`Delete ${lib}, ${file}, ${member}`);

  vscode.postMessage({
    command: "delete_filter",
    lib: lib,
    file: file,
    member: member
  });

}



function add_filter() {
  
  const new_libs: string[] = document.getElementById("new_lib").value.split(',');
  const new_files: string[] = document.getElementById("new_file").value.split(',');
  const new_members: string[] = document.getElementById("new_member").value.split(',');
  const regex: boolean = document.getElementById("new_regex").checked;

  console.log(`Add filter ${new_libs}, ${new_files}, ${new_members}, regex: ${regex}`);

  for (let new_lib of new_libs) {
    for (let new_file of new_files) {
      for (let new_member of new_members) {
        if (new_lib == '') 
          new_lib = regex? '.*' : '*';
        if (new_file == '')
          new_file = regex? '.*' : '*';
        if (new_member == '')
          new_member = regex? '.*' : '*';
    
        vscode.postMessage({
          command: "add_filter",
          lib: new_lib.trim(),
          file: new_file.trim(),
          member: new_member.trim(),
          regex: regex
        });
      }
    }
  }
}




function save_config() {

  let filter: source.IQualifiedSource[] = [];
  let counter = 0;
  let els = document.getElementsByClassName(`source_filter_${counter}`);
  let [lib, file, member] = '';

  while (els.length > 0) {

    const libs = document.getElementById(`lib_${counter}`).value.split(',');
    const files = document.getElementById(`file_${counter}`).value.split(',');
    const members = document.getElementById(`member_${counter}`).value.split(',');
    const regex = document.getElementById(`regex_${counter}`).checked;
    
    for (let lib of libs) {
      for (let file of files) {
        for (let member of members) {
          if (lib == '')
            lib = regex? '.*' : '*';
          if (file == '')
            file = regex? '.*' : '*';
          if (member == '')
            member = regex? '.*' : '*';
      
          filter.push({
            "source-file":file.trim(), 
            "source-lib":lib.trim(), 
            "source-member":member.trim(),
            "use-regex":regex
          });
        }
      }
    }
  

    counter++;
    els = document.getElementsByClassName(`source_filter_${counter}`);
  }

  vscode.postMessage({
    command: 'save_config',
    data: filter
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


