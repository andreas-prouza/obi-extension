import { page_text, showAlert } from "../../tools/javascript/alertBox";
import { init_source_select } from "../../tools/javascript/sourceSelect";
import { typed_post } from "../../tools/javascript/post";
import type { ConfigurationRequest } from "../../../shared/messages/ConfigurationMessages";
import { keep_ui_state } from "../../tools/javascript/ui_state";

/** Text field or text area of the page */
type TextField = HTMLInputElement | HTMLTextAreaElement;
type Checkbox = HTMLInputElement;

const deepmerge = require('deepmerge');


const vscode = acquireVsCodeApi();
const post = typed_post<ConfigurationRequest>(vscode);


/** 'user' or 'project' from a config / data-config attribute; anything else is the project config (as before) */
function config_target(value: string | null | undefined): 'user' | 'project' {
  return value === 'user' ? 'user' : 'project';
}

window.addEventListener("load", main);
//document.addEventListener('DOMContentLoaded', main, false);


let panel: string|undefined;
let panel_tab: string|undefined;



function main() {
  // The page is rendered again after most actions: keep the scroll position
  keep_ui_state(vscode);


  // Rendered by the extension (validated there)
  panel = document.body.dataset.panel;
  panel_tab = document.body.dataset.panelTab;
  init_tabs();

  init_source_select('config_source_list');

  init_overrides();

  check_inputs();

  document.getElementById("save_config")?.addEventListener("click", save_configs);

  document.getElementById("delete_ssh_password")?.addEventListener("click", () => {
    post({
      command: "delete_ssh_password",
      panel: panel,
      panel_tab: panel_tab
    });
  });

  // Add and delete in the tables; the buttons of each scope (config attribute) work on its own fields
  for (const button of document.querySelectorAll<HTMLElement>('.add_global_cmd'))
    button.addEventListener("click", () => {
      add_global_cmd(button);
      reload();
    });

  for (const el of document.querySelectorAll<HTMLElement>('.delete_global_cmd'))
    el.addEventListener("click", () => {
      delete_global_cmd(el.getAttribute('project_user') ?? '', el.getAttribute('key')?.split('|')[2] ?? '');
      reload();
    });

  for (const button of document.querySelectorAll<HTMLElement>('.add_compile_cmd'))
    button.addEventListener("click", () => {
      add_compile_cmd(button);
      reload();
    });

  for (const el of document.querySelectorAll<HTMLElement>('.delete_compile_cmd'))
    el.addEventListener("click", () => {
      delete_compile_cmd(el.getAttribute('project_user') ?? '', el.getAttribute('key')?.split('|')[2] ?? '');
      reload();
    });

  for (const button of document.querySelectorAll<HTMLElement>('.add_global_step'))
    button.addEventListener("click", () => {
      add_global_step(button);
      reload();
    });

  for (const el of document.querySelectorAll<HTMLElement>('.delete_global_step'))
    el.addEventListener("click", () => {
      delete_global_step(el.getAttribute('project_user') ?? '', el.getAttribute('key')?.split('|')[2] ?? '');
      reload();
    });


  // Add new attributes for language settings
  for (const button of document.querySelectorAll<HTMLElement>('.add_language_settings'))
    button.addEventListener('click', () => {
      const config: string = button.getAttribute('config') ?? '';
      const lang: string = (document.getElementById(`add_language_settings_name_${config}`) as HTMLInputElement | null)?.value ?? '';
      add_language_settings(config, lang);
      reload();
    });

  document.getElementsByName(`language-settings-add-property`).forEach((e) => {
    e.addEventListener('click', () => {
      const attr: string = e.getAttribute('id_of_property') ?? '';
      const value: string = (document.getElementById(attr) as HTMLSelectElement | null)?.value ?? '';
      const config: string = e.getAttribute('config') ?? '';
      add_language_attribute(config, e.dataset.language ?? '', value);
      reload();
    });
  });


  for (const field of document.querySelectorAll<TextField>('.cfg-page .obi-input')) {

    if (field.getAttribute('regex_validator'))
      field.addEventListener('change', () => vaidate(field as HTMLInputElement));

    if (!field.classList.contains('mandatory'))
      continue;

    for (const event of ['input', 'change'])
      field.addEventListener(event, () => {
        check_input(field);
        update_missing();
      });
  }

  // "Unsaved changes" as soon as a value of the project or user config changes
  for (const scope of ['project_cfg-view', 'user_cfg-view'])
    document.getElementById(scope)?.addEventListener('input', () => {
      const dirty = document.getElementById('cfg_dirty');
      if (dirty)
        dirty.hidden = false;
    });

  // Add new ESP block
  const new_esp_button = document.getElementsByClassName('add_new_esp_block');
  for (let i = 0; i < new_esp_button.length; i++) {
    const el = new_esp_button[i];
    el.addEventListener("click", (event) => {
      const config: string = el.getAttribute('data-config') ?? '';
      add_esp_block(config);
      reload();
    });
  }
  
  // Delete ESP block
  const delete_esp_buttons = document.getElementsByClassName('delete_esp_block');
  for (let i = 0; i < delete_esp_buttons.length; i++) {
    const el = delete_esp_buttons[i];
    el.addEventListener("click", (event) => {
      const config: string = (event.currentTarget as HTMLElement).getAttribute('data-config') ?? '';
      const index: number = parseInt((event.currentTarget as HTMLElement).getAttribute('data-index') ?? '0', 0);
      delete_esp_block(config, index);
      reload();
    });
  }


  // Add new ESP step
  const new_esp_step_button = document.getElementsByClassName('add_step_to_esp');
  for (let i = 0; i < new_esp_step_button.length; i++) {
    const el = new_esp_step_button[i];
    el.addEventListener("click", (event) => {
      const config: string = el.getAttribute('data-config') ?? '';
      const index: number = parseInt(el.getAttribute('data-index') ?? '0', 0);
      add_step_to_esp(config, index);
      reload();
    });
  }

  // Delete ESP block step
  const delete_esp_step_buttons = document.getElementsByClassName('delete_esp_step');
  for (let i = 0; i < delete_esp_step_buttons.length; i++) {
    const el = delete_esp_step_buttons[i];
    el.addEventListener("click", (event) => {
        const config: string = (event.currentTarget as HTMLElement).getAttribute('data-config') ?? '';
        const espIndex: number = parseInt((event.currentTarget as HTMLElement).getAttribute('data-esp-index') ?? '0', 0);
        const stepIndex: number = parseInt((event.currentTarget as HTMLElement).getAttribute('data-esp-step-index') ?? '0', 0);
        delete_esp_step(config, espIndex, stepIndex);
        reload();
      }
    );
  }

  //-----------------------

  document.getElementById('edit_source_config')?.addEventListener("click", edit_source_config);
  document.getElementById('delete_source_config')?.addEventListener("click", delete_source_config);


  //----------------------------
  // Add handler for global variable
  //----------------------------
  
  for (const el of document.querySelectorAll<HTMLElement>('.add_global_variable'))
    el.addEventListener("click", () => {
      add_global_variable(el);
      reload();
    });

  for (const el of document.querySelectorAll<HTMLElement>('.delete_global_variable'))
    el.addEventListener("click", () => {
      delete_global_variable(el.getAttribute('project_user') ?? '', el.getAttribute('key')?.split('|')[2] ?? '');
      reload();
    });

  
  //----------------------------
  
  window.addEventListener('message', receive_message);

  check_error_text();
  
  // Show configuration loaded message in the UI instead of alert
  showAlert(page_text('obi_text_reloaded', 'Configuration reloaded.'), 'success');
}







//----------------------------
// Scopes (project, user, sources) and sections (left list); panel and panel_tab go back to the extension with each message
//----------------------------

function init_tabs(): void {
  for (const tab of document.querySelectorAll<HTMLElement>('.scope-tab'))
    tab.addEventListener('click', () => show_tabs(tab.id, panel_tab));
  for (const tab of document.querySelectorAll<HTMLElement>('.panel_tab'))
    tab.addEventListener('click', () => show_tabs(panel, tab.dataset.tab));
  show_tabs(panel, panel_tab);
}


function show_tabs(new_panel: string | undefined, new_tab: string | undefined): void {
  const scopes = [...document.querySelectorAll<HTMLElement>('.scope-tab')];
  const scope = scopes.find(tab => tab.id === new_panel) ?? scopes[0];
  if (!scope)
    return;
  panel = scope.id;
  const prefix = panel.replace('_cfg', '');
  const sections = [...document.querySelectorAll<HTMLElement>(`#${panel}-view .panel_tab`)];
  const section = sections.find(tab => tab.dataset.tab === new_tab) ?? sections[0];
  if (section)
    panel_tab = section.dataset.tab;

  for (const tab of scopes) {
    const active = tab === scope;
    tab.setAttribute('aria-checked', String(active));
    tab.setAttribute('aria-selected', String(active));
    const view = document.getElementById(tab.dataset.view ?? '');
    if (view)
      view.hidden = !active;
  }
  for (const tab of sections) {
    const active = tab === section;
    tab.setAttribute('aria-selected', String(active));
    tab.classList.toggle('active', active);
    const view = document.getElementById(`${prefix}_view-${tab.dataset.tab}`);
    if (view)
      view.hidden = !active;
  }
  // File link and description of the scope
  for (const el of document.querySelectorAll<HTMLElement>('[data-scope]'))
    el.hidden = el.dataset.scope !== panel;
}


/** Section of a field: its tab view (data-panel, e.g. "project_tab-1") */
function panel_of(element: Element): string | undefined {
  return element.closest<HTMLElement>('.tab-view')?.dataset.panel;
}


/** Dots on the scopes and sections with missing values, and the banner with a link to each of them */
function update_missing(): void {
  const missing = [...document.querySelectorAll<TextField>('.obi-input.mandatory.missing_value')];
  const panels = new Set(missing.map(panel_of));

  for (const tab of document.querySelectorAll<HTMLElement>('.panel_tab'))
    tab.classList.toggle('missing_value', panels.has(tab.id));
  for (const tab of document.querySelectorAll<HTMLElement>('.scope-tab'))
    tab.classList.toggle('missing_value', [...panels].some(item => item?.startsWith(tab.id.replace('_cfg', '_'))));

  const banner = document.getElementById('still_missing');
  const list = document.getElementById('still_missing_list');
  if (!banner || !list)
    return;
  banner.hidden = missing.length === 0;
  list.replaceChildren(...missing.flatMap((field, index) => {
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = field.closest('.setting')?.querySelector('label')?.textContent?.trim() || field.id;
    link.addEventListener('click', event => {
      event.preventDefault();
      const [scope_tab] = (panel_of(field) ?? '').split('_tab');
      show_tabs(`${field.id.split('|')[0]}_cfg`, (panel_of(field) ?? '').replace(`${scope_tab}_`, ''));
      field.focus();
    });
    return index === 0 ? [link] : [document.createTextNode(', '), link];
  }));
}


//----------------------------
// User config: override a value of the project config or use it again (config_field.html)
//----------------------------

/** Text field, text area or checkbox of the config page */
type ConfigField = HTMLElement & { value: string; checked: boolean; disabled: boolean };


function override_field(wrapper: HTMLElement): ConfigField | null {
  return wrapper.querySelector<ConfigField>('.user_save_app');
}


/** An inherited field shows the value of the project tab (also unsaved changes there) */
function show_project_value(wrapper: HTMLElement): void {
  const field = override_field(wrapper);
  const project = document.getElementById(`project|${wrapper.dataset.overrideKey}`) as ConfigField | null;
  if (!field)
    return;
  if (field.classList.contains('type_checkbox'))
    field.checked = project?.checked ?? false;
  else
    field.value = project?.value ?? '';
}


function set_overridden(wrapper: HTMLElement, overridden: boolean): void {
  wrapper.classList.toggle('overridden', overridden);
  wrapper.classList.toggle('inherited', !overridden);

  const field = override_field(wrapper);
  if (field)
    field.disabled = !overridden;
  if (!overridden)
    show_project_value(wrapper);

  const toggle = wrapper.querySelector<HTMLElement>('.override_toggle');
  if (!toggle)
    return;
  const title = (overridden ? toggle.dataset.titleOverridden : toggle.dataset.titleInherited) ?? '';
  toggle.title = title;
  toggle.setAttribute('aria-label', title);
  toggle.setAttribute('aria-pressed', String(overridden));
  const icon = toggle.querySelector('.codicon');
  icon?.classList.toggle('codicon-discard', overridden);
  icon?.classList.toggle('codicon-edit', !overridden);
}


function init_overrides(): void {
  document.querySelectorAll<HTMLElement>('.cfg_field[data-override-key]').forEach(wrapper => {
    set_overridden(wrapper, wrapper.classList.contains('overridden'));

    wrapper.querySelector('.override_toggle')?.addEventListener('click', () => {
      const overridden = !wrapper.classList.contains('overridden');
      set_overridden(wrapper, overridden);
      if (overridden)
        override_field(wrapper)?.focus();
    });

    const project = document.getElementById(`project|${wrapper.dataset.overrideKey}`);
    for (const event of ['input', 'change'])
      project?.addEventListener(event, () => {
        if (wrapper.classList.contains('inherited'))
          show_project_value(wrapper);
      });
  });
}



function add_global_variable(e: HTMLElement) {
  
  const config: string = e.getAttribute('config') ?? '';
  save_config(config);

  const key:string = (document.getElementById(`new_global_variable_key_${config}`) as TextField).value;
  const value:string = (document.getElementById(`new_global_variable_value_${config}`) as TextField).value;
  const type:string = (document.getElementById(`new_global_variable_type_${config}`) as HTMLSelectElement).value;


  post({
    command: "add_global_variable",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config_target(config),
    key: key,
    value: value,
    type: type
  });

  reload();

}




function delete_global_variable(config: string, key: string) {

  
  save_config(config);

  post({
    command: "delete_global_variable",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config_target(config),
    key: key
  });

}



function add_esp_block(config: string) {
  
  post({
    command: "add_esp_block",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config_target(config)
  });

}


function add_step_to_esp(config: string, index: number) {
  
  post({
    command: "add_esp_step",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config_target(config),
    index: index
  });

}


function delete_esp_block(config: string, index: number) {
  
  post({
    command: "delete_esp_block",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config_target(config),
    index: index
  });

}


function delete_esp_step(config: string, espIndex: number, stepIndex: number) {

  post({
    command: "delete_esp_step",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config_target(config),
    esp_index: espIndex,
    step_index: stepIndex
  });


}



function edit_source_config() {
  
  const config_source_list = document.getElementById('config_source_list') as HTMLSelectElement;
  const key: string|null = config_source_list.value;

  post({
    command: "edit_source_config",
    source: key
  });

}

function add_source_config() {

  const config_source_list = document.getElementById('new_config_source_list') as HTMLSelectElement;
  const key: string|null = config_source_list.value;

  post({
    command: "add_source_config",
    panel: panel,
    panel_tab: panel_tab,
    source: key
  });

}



function delete_source_config() {

  const config_source_list = document.getElementById('config_source_list') as HTMLSelectElement;
  const key: string|null = config_source_list.value;

  post({
    command: "delete_source_config",
    panel: panel,
    panel_tab: panel_tab,
    source: key
  });

}



function delete_global_cmd(config: string, key: string) {

  
  save_config(config);


  post({
    command: "delete_global_cmd",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config_target(config),
    key: key
  });

}



function delete_compile_cmd(config: string, key: string) {

  
  save_config(config);

  post({
    command: "delete_compile_cmd",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config_target(config),
    key: key
  });

}



function delete_global_step(config: string, key: string) {
  
  
  save_config(config);

  post({
    command: "delete_global_step",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config_target(config),
    key: key
  });

}


function add_global_cmd(e: HTMLElement) {
  
  const config: string = e.getAttribute('config') ?? '';


  save_config(config);

  const key = document.getElementById(`new_global_cmd_key_${config}`) as TextField;
  const value = document.getElementById(`new_global_cmd_value_${config}`) as TextField;

  post({
    command: "add_global_cmd",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config_target(config),
    key: key.value,
    value: value.value
  });

}



function add_compile_cmd(e: HTMLElement) {
  
  const config: string = e.getAttribute('config') ?? '';


  save_config(config);

  const key = document.getElementById(`new_compile_cmd_key_${config}`) as TextField;
  const value = document.getElementById(`new_compile_cmd_value_${config}`) as TextField;

  post({
    command: "add_compile_cmd",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config_target(config),
    key: key.value,
    value: value.value
  });

}


function add_global_step(e: HTMLElement) {
  
  const config: string = e.getAttribute('config') ?? '';

  save_config(config);

  const key = document.getElementById(`new_global_step_key_${config}`) as TextField;
  const value = document.getElementById(`new_global_step_value_${config}`) as TextField;

  post({
    command: "add_global_step",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config_target(config),
    key: key.value,
    value: value.value
  });

}




function add_language_attribute(class_prefix: string, language: string, attribute: string) {
  
  save_config(class_prefix);

  post({
    command: "add_language_attribute",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config_target(class_prefix),
    language: language,
    attribute: attribute
  });

}



function add_language_settings(class_prefix: string, language: string) {
  
  save_config(class_prefix);

  post({
    command: "add_language_settings",
    panel: panel,
    panel_tab: panel_tab,
    user_project: config_target(class_prefix),
    language: language
  });

}




function vaidate (element: HTMLInputElement): void {
  
  const attr: string|null = element.getAttribute('regex_validator');
  const hint = (document.getElementById(`hint_${element.id}`) as HTMLLabelElement);
  hint.style.visibility = "hidden";

  if (attr && element.value.length > 0) {
    const reg = new RegExp(attr);
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
    post({
      command: `save_ssh_password`,
      panel: panel,
      panel_tab: panel_tab,
      password: ssh_password.value
    });

  reload();

}



function check_error_text() {
  let error_el: HTMLDivElement = document.getElementById('error_text') as HTMLDivElement;

  if (error_el.getAttribute('show') === 'true')
    error_el.style.display = "";
  else
    error_el.style.display = "none";
}



function check_input(element: Element) {

  element.classList.remove('missing_value');

  const elem_value: string = (element as HTMLInputElement).value;
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
  for (const element of document.querySelectorAll('.obi-input.mandatory'))
    check_input(element);
  update_missing();
}




function set_element_missing_value(element: Element) {
  element.classList.add('missing_value');
}




//function save_global_cmds(class_prefix:string) {
function get_global_cmds(class_prefix:string) {

  let results: Record<string, string> = {};

  const app_elements = document.getElementsByClassName(`${class_prefix}_save_app_global_cmds`);
  for (let i = 0; i < app_elements.length; i++) {
    
    const el2: string[] = app_elements[i].id.split('|');
    const key = el2[3];
    const value = (document.getElementById(`${class_prefix}|global|cmds|${key}|value`) as TextField).value;

    results[key] = value;
  }

  return results;
}




//function save_global_step(class_prefix:string) {
function get_global_steps(class_prefix:string) {

  let results: Record<string, string[]> = {};
  const app_elements = document.getElementsByClassName(`${class_prefix}_save_app_global_step`);
  for (let i = 0; i < app_elements.length; i++) {
    
    const key = (document.getElementById(app_elements[i].id) as TextField).value;
    const value = (document.getElementById(`${class_prefix}|global|steps|${key}|value`) as TextField).value;
    const value_list = value.split('\n');

    results[key] = value_list;
  }
  
  return results;
}



function get_compile_cmds(class_prefix:string) {

  let results: Record<string, string> = {};
  const app_elements = document.getElementsByClassName(`${class_prefix}_save_app_compile_cmd`);
  for (let i = 0; i < app_elements.length; i++) {
    
    const el2: string[] = app_elements[i].id.split('|');
    const key = el2[3];
    const value = (document.getElementById(`${class_prefix}|global|compile-cmds|${key}|value`) as TextField).value;
    
    results[key] = value;
  }
  return results;
}



function reload() {
  post({
    command: `reload`
  });
}



function save_esp(config:string) {
  
  let results = [];
  let steps = [];

  const app_elements = document.getElementsByClassName(`${config}_esp_group`);

  for (let i = 0; i < app_elements.length; i++) {

    const el = app_elements[i];
    const block_loop = el.getAttribute('data-index');
    const steps_count = parseInt(el.getAttribute('data-step-count') || '0', 0);
    const use_regex = (document.getElementById(`${config}|esp|${block_loop}|use_regex`) as Checkbox).checked;

    const allow_multiple_matches = (document.getElementById(`${config}|esp|${block_loop}|allow_multiple_matches`) as Checkbox).checked;
    const conditions = (document.getElementById(`${config}|esp|${block_loop}|conditions`) as TextField).value;


    let conditionsDict: Record<string, string> = {};
    try {
      conditionsDict = JSON.parse(conditions);
    } catch (e) {
      console.error("Failed to parse properties as JSON:", conditions, e);
    }

    steps = [];

    for (let i = 0; i < steps_count; i++) {

      const add_default = (document.getElementById(`${config}|esp|${block_loop}|steps|${i}|add_default_steps`) as Checkbox).checked;
      const step = (document.getElementById(`${config}|esp|${block_loop}|steps|${i}|step`) as TextField).value;
      const properties = (document.getElementById(`${config}|esp|${block_loop}|steps|${i}|properties`) as TextField).value;
      // Convert properties string to a valid dictionary
      let propertiesDict: Record<string, string> = {};
      try {
        propertiesDict = JSON.parse(properties);
      } catch (e) {
        console.error("Failed to parse properties as JSON:", properties, e);
      }
      const exit_point_script = (document.getElementById(`${config}|esp|${block_loop}|steps|${i}|exit_point_script`) as TextField).value;
      const cmd = (document.getElementById(`${config}|esp|${block_loop}|steps|${i}|cmd`) as TextField | null)?.value ?? '';
      steps.push({ add_default_steps: add_default, 
        step: step, 
        // Only written when set; a command wins over the step
        ...(cmd.trim().length > 0 ? { cmd: cmd } : {}),
        properties: propertiesDict, 
        exit_point_script: exit_point_script 
      });
    }
    
    results.push({ 
      use_regex: use_regex,
      allow_multiple_matches: allow_multiple_matches, 
      conditions: conditionsDict, 
      steps: steps 
    });
  };


  post({
    command: `save_esp`,
    user_project: config_target(config),
    panel: panel,
    panel_tab: panel_tab,
    data: results
  });

}



function save_config(class_prefix:string) {

  let app_config: any = {};


  const global_cmds = get_global_cmds(class_prefix);
  const global_steps = get_global_steps(class_prefix);
  const compile_cmds = get_compile_cmds(class_prefix);
  save_esp(class_prefix);

  app_config['global'] = { cmds: global_cmds, steps: global_steps, 'compile-cmds': compile_cmds };

  const app_elements = document.getElementsByClassName(`${class_prefix}_save_app`);
  let json_string: string = '';
  // User config: values that take the project value again (removed from the file)
  const unset: string[] = [];

  for (let i = 0; i < app_elements.length; i++) {

    let item = {};
    const el2: string[] = app_elements[i].id.split('|');

    json_string = '';

    for (let i=1; i < el2.length; i++) {
      if (i > 1)
        json_string = `${json_string} :`;
      json_string = `${json_string} { "${el2[i]}"`;
    }

    const elem_value = (app_elements[i] as HTMLInputElement).value.replaceAll('\\', '\\\\').replaceAll('"', '\\\"');

    if (class_prefix === 'user') {
      const inherited = app_elements[i].closest('.cfg_field.inherited') !== null;
      const blank = !app_elements[i].classList.contains('type_checkbox') && (elem_value.trim().length == 0 || elem_value == 'NaN');
      if (inherited || blank) {
        unset.push(el2.slice(1).join('|'));
        continue;
      }
    }

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
      if ((app_elements[i] as Checkbox).checked)
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


  if (class_prefix !== 'user' && class_prefix !== 'project')
    return;   // source configs are saved on their own page
  post({
    command: 'save_config',
    target: class_prefix,
    panel: panel,
    panel_tab: panel_tab,
    data: app_config,
    unset: class_prefix === 'user' ? unset : undefined
  });
}




function receive_message(e: MessageEvent) {

  switch (e.data.command) {
    
    case 'finished_saving_config':
      showAlert(page_text('obi_text_reloaded', 'Configuration reloaded.'), 'success');
      break;
  }
}


