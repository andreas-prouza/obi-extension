// Client for the web API of i-Releaser 3.1.0 or newer (docs/webapi.md of i-Releaser).
// The token goes in the Authorization header, never in the URL.


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

function is_object(value: unknown): value is JsonObject {
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



async function request(base: string, token: string, method: 'GET' | 'POST', api_path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {

  let response: Response;
  try {
    response = await fetch(`${base}/api/${api_path}`, {
      method: method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
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



/** Names of the workflows the token may read */
export async function get_workflows(base: string, token: string, signal?: AbortSignal): Promise<string[]> {
  const data = await request(base, token, 'GET', 'get_workflows', undefined, signal);
  if (!Array.isArray(data))
    throw new IReleaserError('Unexpected answer of get_workflows');
  return data.map(workflow => is_object(workflow) ? workflow['name'] : undefined)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
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

  const data: JsonObject = JSON.parse(JSON.stringify(compile_list));
  delete data['config'];

  const custom_data = data['custom_data'];
  if (is_object(custom_data)) {
    delete custom_data[CUSTOM_DATA_KEY];
    delete custom_data[TEMPLATE_CUSTOM_DATA_KEY];
  }

  for (const level of Array.isArray(data['compiles']) ? data['compiles'] : []) {
    for (const source of is_object(level) && Array.isArray(level['sources']) ? level['sources'] : []) {
      for (const cmd of is_object(source) && Array.isArray(source['cmds']) ? source['cmds'] : []) {
        if (!is_object(cmd))
          continue;
        delete cmd['joblog'];
        delete cmd['stdout'];
        delete cmd['stderr'];
      }
    }
  }
  return data;
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
