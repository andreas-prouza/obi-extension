// Client for the web API of i-Releaser 3.1.0 or newer (docs/webapi.md of i-Releaser).
// The token goes in the Authorization header, never in the URL.

import { strip_cmd_logs } from './CompileListLogs';

/** Failed request. The message is for the user and never contains the token. */
export class IReleaserError extends Error {}


/** Deployment started for a build list, stored as custom_data['i-releaser'] in compile-list.json */
export interface DeploymentRecord {
  id: number | string;
  workflow: string;
  project?: string;
  deploy_version?: number | string;
  started: string;
}

export const CUSTOM_DATA_KEY = 'i-releaser';
// Custom build summary templates stored the whole answer of i-Releaser as custom_data.json
const TEMPLATE_CUSTOM_DATA_KEY = 'json';


type JsonObject = Record<string, unknown>;

export function is_object(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}



/** http(s) URL of i-Releaser without trailing "/"; undefined for anything else (also with user, query or fragment) */
export function base_url(url: unknown): string | undefined {
  if (typeof url !== 'string' || url.trim() === '')
    return undefined;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  }
  catch {
    return undefined;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    return undefined;
  if (parsed.username || parsed.password || parsed.search || parsed.hash)
    return undefined;
  return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
}


export function show_details_url(base: string, id: number | string): string {
  return `${base}/show_details/${encodeURIComponent(String(id))}`;
}



async function send(base: string, token: string, method: 'GET' | 'POST', api_path: string, body: unknown, signal?: AbortSignal, accept = 'application/json'): Promise<Response> {
  try {
    return await fetch(`${base}/api/${api_path}`, {
      method: method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // A redirect goes to the login page: older i-Releaser versions ignore the header
      redirect: 'manual',
      signal: signal
    });
  }
  catch (e: unknown) {
    if (signal?.aborted)
      throw e;
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : String(e);
    throw new IReleaserError(`${base} is not reachable (${cause})`);
  }
}


/** JSON answer of `/api/<api_path>`; IReleaserError with the server's message on errors (never with the token) */
export async function request(base: string, token: string, method: 'GET' | 'POST', api_path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  return answer_of(await send(base, token, method, api_path, body, signal));
}


/** JSON of a successful answer; IReleaserError with the server's message otherwise */
async function answer_of(response: Response): Promise<unknown> {

  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  }
  catch {
    data = undefined;
  }

  if (!response.ok || data === undefined) {
    const message = is_object(data) ? (data['message'] ?? data['Error']) : undefined;
    // 3.1.0 answers a wrong token with "not permitted": "not logged in" means the token wasn't read
    const hint = response.status === 401 && message === 'You are not logged in'
      ? ' (i-Releaser ignored the token in the Authorization header: i-Releaser 3.1.0 or newer is needed)' : '';
    if (message !== undefined)
      throw new IReleaserError(`HTTP ${response.status}: ${typeof message === 'string' ? message : JSON.stringify(message)}${hint}`);
    throw new IReleaserError(`HTTP ${response.status} without JSON answer. i-Releaser 3.1.0 or newer is needed.`);
  }
  // Format of older versions
  if (is_object(data) && data['Error'] !== undefined)
    throw new IReleaserError(String(data['Error']));
  return data;
}



/** A workflow of i-Releaser (part of its definition) */
export interface WorkflowDefinition {
  name: string;
  default_project?: string;
}

/** The workflows the token may read */
export async function get_workflow_definitions(base: string, token: string, signal?: AbortSignal): Promise<WorkflowDefinition[]> {
  const data = await request(base, token, 'GET', 'get_workflows', undefined, signal);
  if (!Array.isArray(data))
    throw new IReleaserError('Unexpected answer of get_workflows');
  const definitions: WorkflowDefinition[] = [];
  for (const workflow of data) {
    if (!is_object(workflow) || typeof workflow['name'] !== 'string' || workflow['name'].length === 0)
      continue;
    const project = workflow['default_project'];
    definitions.push(typeof project === 'string' && project !== '' ? { name: workflow['name'], default_project: project } : { name: workflow['name'] });
  }
  return definitions;
}

/** Names of the workflows the token may read */
export async function get_workflows(base: string, token: string, signal?: AbortSignal): Promise<string[]> {
  return (await get_workflow_definitions(base, token, signal)).map(workflow => workflow.name);
}



/** The `workflows` list of deployment.toml: trimmed, without empty and duplicate names; [] if it isn't a list */
export function configured_workflows(value: unknown): string[] {
  if (!Array.isArray(value))
    return [];
  const names = value.filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(v => v.length > 0);
  return [...new Set(names)];
}



/**
 * Workflows to offer, the default first: with a `workflows` list the listed ones and the default,
 * otherwise all of i-Releaser. Only names i-Releaser knows; `unknown` are the configured names it doesn't know.
 */
export function workflow_choices(available: string[], workflows: unknown, default_workflow: unknown): { choices: string[]; unknown: string[] } {
  const configured = configured_workflows(workflows);
  const named = configured_workflows([default_workflow, ...configured]);
  const offered = configured.length > 0 ? named : configured_workflows([...named, ...available]);
  return {
    choices: offered.filter(name => available.includes(name)),
    unknown: named.filter(name => !available.includes(name))
  };
}



/** Creates a deployment of the workflow with custom_data (at most 64 KB, checked by i-Releaser) */
export async function start_workflow(base: string, token: string, workflow: string, custom_data: JsonObject, signal?: AbortSignal, now: Date = new Date()): Promise<DeploymentRecord> {

  const data = await request(base, token, 'POST', `start_workflow/${encodeURIComponent(workflow)}`, custom_data, signal);

  const meta_file = is_object(data) && data['status'] === 'success' ? data['meta_file'] : undefined;
  const general = is_object(meta_file) ? meta_file['general'] : undefined;
  const id = is_object(general) ? general['id'] : undefined;
  if (!is_object(general) || (typeof id !== 'number' && typeof id !== 'string')) {
    const message = is_object(data) ? data['message'] : undefined;
    throw new IReleaserError(typeof message === 'string' ? message : 'Answer without deployment id');
  }

  const record: DeploymentRecord = { id: id, workflow: workflow, started: now.toISOString() };
  if (typeof general['project'] === 'string')
    record.project = general['project'];
  if (typeof general['deploy_version'] === 'number' || typeof general['deploy_version'] === 'string')
    record.deploy_version = general['deploy_version'];
  return record;
}



/**
 * The build list as custom data of a deployment, as a copy. Removed:
 * - joblogs and spool files (i-Releaser accepts at most 64 KB)
 * - `config`, which older build lists contain with secret variables
 * - deployments started earlier for this build list
 */
export function deployment_data(compile_list: JsonObject): JsonObject {

  const data = strip_cmd_logs(compile_list);
  delete data['config'];

  const custom_data = data['custom_data'];
  if (is_object(custom_data)) {
    delete custom_data[CUSTOM_DATA_KEY];
    delete custom_data[TEMPLATE_CUSTOM_DATA_KEY];
  }
  return data;
}



/** A step of a stage (an action of i-Releaser) */
export interface StepState {
  id: number | string;
  sequence?: number;
  /** processing_step, or the command */
  label: string;
  cmd: string;
  status: string;
  /** Id of the latest run (run_history), for get_action_log */
  last_run?: number | string;
}

/** A stage of a deployment */
export interface StageState {
  id: number | string;
  name: string;
  status: string;
  /** In the order of their sequence */
  steps: StepState[];
}

/** What OBI shows of a deployment (answer of get_meta_file_json) */
export interface DeploymentState {
  id: number | string;
  status: string;
  project?: string;
  deploy_version?: number | string;
  workflow?: string;
  update_time?: string;
  /** In the order i-Releaser created them (by id) */
  stages: StageState[];
}

/** A change between two reads of a deployment, for a notification */
export interface StateChange {
  kind: 'stage-finished' | 'stage-failed' | 'canceled';
  stage?: string;
}


export const is_id = (value: unknown): value is number | string => typeof value === 'number' || (typeof value === 'string' && value !== '');

/** Numbers by value, everything else as text */
export function compare_ids(a: number | string, b: number | string): number {
  return typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true });
}

/** `text` with at most `max` characters */
export function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}


function parse_step(action: unknown): StepState | undefined {
  if (!is_object(action) || !is_id(action['id']) || typeof action['status'] !== 'string')
    return undefined;
  const cmd = typeof action['cmd'] === 'string' ? action['cmd'].trim() : '';
  const processing_step = typeof action['processing_step'] === 'string' ? action['processing_step'].trim() : '';
  const step: StepState = { id: action['id'], label: processing_step || shorten(cmd, 60) || String(action['id']), cmd: cmd, status: action['status'] };
  if (typeof action['sequence'] === 'number')
    step.sequence = action['sequence'];
  const runs = (Array.isArray(action['run_history']) ? action['run_history'] : [])
    .map(run => is_object(run) ? run['id'] : undefined)
    .filter(is_id)
    .sort(compare_ids);
  if (runs.length > 0)
    step.last_run = runs[runs.length - 1];
  return step;
}


function parse_stage(stage: unknown): StageState | undefined {
  if (!is_object(stage) || !is_id(stage['id']) || typeof stage['status'] !== 'string')
    return undefined;
  const steps = (Array.isArray(stage['actions']) ? stage['actions'] : [])
    .map(parse_step)
    .filter((step): step is StepState => step !== undefined)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0) || compare_ids(a.id, b.id));
  return { id: stage['id'], name: typeof stage['name'] === 'string' ? stage['name'] : String(stage['id']), status: stage['status'], steps: steps };
}


/** The deployment of a get_meta_file_json answer */
export function parse_deployment(data: unknown): DeploymentState {

  const general = is_object(data) ? data['general'] : undefined;
  if (!is_object(general) || !is_id(general['id']) || typeof general['status'] !== 'string')
    throw new IReleaserError('Unexpected answer of get_meta_file_json');

  const stages: StageState[] = [general['processed_stages'], general['open_stages']]
    .flatMap(list => Array.isArray(list) ? list : [])
    .map(parse_stage)
    .filter((stage): stage is StageState => stage !== undefined)
    .sort((a, b) => compare_ids(a.id, b.id));

  const state: DeploymentState = { id: general['id'], status: general['status'], stages: stages };
  if (typeof general['project'] === 'string')
    state.project = general['project'];
  if (is_id(general['deploy_version']))
    state.deploy_version = general['deploy_version'];
  const workflow = general['workflow'];
  if (is_object(workflow) && typeof workflow['name'] === 'string')
    state.workflow = workflow['name'];
  if (typeof general['update_time'] === 'string')
    state.update_time = general['update_time'];
  return state;
}


/** The deployment with its stages */
export async function get_deployment(base: string, token: string, id: number | string, signal?: AbortSignal): Promise<DeploymentState> {
  return parse_deployment(await request(base, token, 'POST', `get_meta_file_json/${encodeURIComponent(String(id))}`, undefined, signal));
}


/** Nothing changes any more without someone starting it again */
export function is_final(state: DeploymentState): boolean {
  return state.status === 'finished' || state.status === 'canceled';
}


/** Stages that finished or failed since `before`, and whether the deployment was canceled */
export function state_changes(before: DeploymentState, after: DeploymentState): StateChange[] {
  const old_status = new Map(before.stages.map(stage => [String(stage.id), stage.status]));
  const changes: StateChange[] = [];
  for (const stage of after.stages) {
    if (stage.status === old_status.get(String(stage.id)))
      continue;
    if (stage.status === 'finished')
      changes.push({ kind: 'stage-finished', stage: stage.name });
    else if (stage.status === 'failed')
      changes.push({ kind: 'stage-failed', stage: stage.name });
  }
  if (after.status === 'canceled' && before.status !== 'canceled')
    changes.push({ kind: 'canceled' });
  return changes;
}


/** CSS class of the build summary for a status of i-Releaser */
export function status_class(status: string): 'success' | 'failed' | 'in_process' | 'new' {
  switch (status) {
    case 'finished': return 'success';
    case 'failed':
    case 'canceled': return 'failed';
    case 'in process':
    case 'in preperation':
    case 'prepare': return 'in_process';
    default: return 'new';
  }
}



const MAX_EVENT_SIZE = 1024 * 1024;

/** Server-sent events: collects the chunks of a stream and returns the data of each complete event */
export class SseParser {

  private buffer = '';

  /** Data of the events completed by this chunk; comments (": keep-alive") and events without data are skipped */
  push(chunk: string): string[] {
    // "\r\n" may be split between two chunks: normalised on the whole buffer
    this.buffer = (this.buffer + chunk).replace(/\r\n/g, '\n');
    const events: string[] = [];
    let end: number;
    while ((end = this.buffer.indexOf('\n\n')) >= 0) {
      const block = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, ''));
      if (data.length > 0)
        events.push(data.join('\n'));
    }
    if (this.buffer.length > MAX_EVENT_SIZE)
      throw new IReleaserError('watch_state: event too large');
    return events;
  }
}



/**
 * Follows a deployment with the server-sent events of watch_state: calls `on_change` for each change of its state,
 * the first time right after connecting. `on_change` returns false to stop.
 * Ends when the server closes the stream. An error event, or no data within `idle_ms` (i-Releaser sends a keep-alive
 * every 2 s), throws IReleaserError.
 */
export async function watch_state(base: string, token: string, id: number | string, on_change: () => Promise<boolean>, signal?: AbortSignal, idle_ms = 30_000): Promise<void> {

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  if (signal?.aborted)
    controller.abort();

  let idle = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop_timer = () => clearTimeout(timer);
  const start_timer = () => {
    stop_timer();
    timer = setTimeout(() => { idle = true; controller.abort(); }, idle_ms);
  };

  try {
    start_timer();
    const response = await send(base, token, 'GET', `watch_state/${encodeURIComponent(String(id))}`, undefined, controller.signal, 'text/event-stream');
    if (!response.ok) {
      await answer_of(response);
      throw new IReleaserError(`HTTP ${response.status}`);
    }
    if (!response.body)
      throw new IReleaserError('watch_state: answer without content');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    for (;;) {
      const { done, value } = await reader.read();
      if (done)
        return;
      for (const data of parser.push(decoder.decode(value, { stream: true }))) {
        let event: unknown;
        try {
          event = JSON.parse(data);
        }
        catch {
          event = undefined;
        }
        if (is_object(event) && event['status'] === 'error')
          throw new IReleaserError(typeof event['message'] === 'string' ? event['message'] : 'watch_state failed');
        // Reading the deployment may take longer than the idle time
        stop_timer();
        if (!await on_change())
          return;
      }
      start_timer();
    }
  }
  catch (e: unknown) {
    if (idle && !signal?.aborted)
      throw new IReleaserError(`No data from ${base} within ${idle_ms / 1000} seconds`);
    throw e;
  }
  finally {
    stop_timer();
    signal?.removeEventListener('abort', abort);
    // Closes the connection
    controller.abort();
  }
}



/** Deployment started for this build list: by OBI, or by a custom template (custom_data.json) */
export function deployment_of(compile_list: unknown): { id: number | string; workflow?: string } | undefined {

  const custom_data = is_object(compile_list) ? compile_list['custom_data'] : undefined;
  if (!is_object(custom_data))
    return undefined;

  const record = custom_data[CUSTOM_DATA_KEY];
  if (is_object(record) && (typeof record['id'] === 'number' || typeof record['id'] === 'string'))
    return { id: record['id'], workflow: typeof record['workflow'] === 'string' ? record['workflow'] : undefined };

  const answer = custom_data[TEMPLATE_CUSTOM_DATA_KEY];
  const meta_file = is_object(answer) ? answer['meta_file'] : undefined;
  const general = is_object(meta_file) ? meta_file['general'] : undefined;
  const id = is_object(general) ? general['id'] : undefined;
  if (typeof id === 'number' || typeof id === 'string')
    return { id: id };
  return undefined;
}
