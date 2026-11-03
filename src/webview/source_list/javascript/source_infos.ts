import "../../tools/javascript/toolkit";
import {
  Button,
  TextField
} from "@vscode/webview-ui-toolkit";

import * as source from '../../../shared/Source';
import { page_text, showAlert } from "../../tools/javascript/alertBox";
import { typed_post } from "../../tools/javascript/post";
import type { SourceInfosRequest } from "../../../shared/messages/SourceListMessages";


const vscode = acquireVsCodeApi();
const post = typed_post<SourceInfosRequest>(vscode);

// jQuery + bootstrap-table are loaded as classic scripts by the template
interface BootstrapTable {
  bootstrapTable(method: 'updateCell', params: { index: number; field: string; value: string; reinit: boolean }): void;
}
declare const $: ((selector: string) => BootstrapTable) | undefined;

window.addEventListener("load", main);



function main() {
  // To get improved type annotations/IntelliSense the associated class for
  // a given toolkit component can be imported and used to type cast a reference
  // to the element (i.e. the `as Button` syntax)

  const save_button = document.getElementById("save_config") as Button;
  save_button?.addEventListener("click", save_config);

  // Delegated, because bootstrap-table re-renders rows (paging, sorting)
  document.addEventListener('focusout', (event: FocusEvent) => {
    const field = event.target;
    if (field instanceof HTMLElement && field.classList.contains('source_description'))
      description_changed(field as TextField);
  });

  showAlert(page_text('obi_text_reloaded', 'Configuration reloaded.'), 'success');
}



function escape_html(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}



function description_changed(field: TextField) {

  if (field.dataset.original === field.value)
    return;
  field.dataset.original = field.value;

  // bootstrap-table renders rows from its own copy of the cell HTML: keep it in sync,
  // otherwise the edit is lost after paging or sorting. All values are escaped.
  const row_index = Number(field.closest('tr')?.getAttribute('data-index'));
  if (typeof $ === 'function' && !Number.isNaN(row_index)) {
    const attributes = ['lib', 'file', 'member']
      .map(name => `data-${name}="${escape_html(field.dataset[name] ?? '')}"`)
      .join(' ');
    $('#source_list').bootstrapTable('updateCell', {
      index: row_index,
      field: 'description',
      value: `<vscode-text-field class="source_description" size="80" placeholder="${escape_html(field.placeholder ?? '')}" ${attributes} `
        + `data-original="${escape_html(field.value)}" value="${escape_html(field.value)}"></vscode-text-field>`,
      reinit: false
    });
  }

  save_config();
}



function save_config() {

  const sources: source.ISourceInfos = {};
  const els  = document.getElementsByClassName('source_description');

  for (let i=0; i < els.length; i++) {

    const el = els[i] as TextField;

    const lib: string|undefined = el.dataset.lib;
    const file: string|undefined = el.dataset.file;
    const member: string|undefined = el.dataset.member;

    const full_name = `${lib||'UNKNOWN'}/${file||'UNKNOWN'}/${member||'UNKNOWN'}`;
    sources[full_name] = {description: el.value};
  }

  post({
    command: 'save_config',
    data: sources
  });

}
