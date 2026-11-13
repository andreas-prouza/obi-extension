// Deployments view and its actions: requests and rules for the web API of i-Releaser 3.1.0 (docs/webapi.md of i-Releaser).
// No vscode imports: this module is unit-tested in plain Node.

import { IReleaserError, StageState, StepState, WorkflowDefinition, configured_workflows, is_id, is_object, request } from './IReleaser';


/** A deployment of list_deployments */
export interface DeploymentSummary {
  id: number | string;
  version?: number | string;
  status: string;
  workflow?: string;
  commit?: string;
  create_time?: string;
  update_time?: string;
}

export type StageOption = 'continue' | 'run_all';

/** Answer of run_stage: in mode "service" the stage waits for the processing service */
export interface RunStageAnswer {
  mode?: string;
  job_id?: number | string;
  service_running?: boolean;
}

/** One run of a step */
export interface ActionLog {
  status?: string;
  create_time?: string;
  stdout: string;
  stderr: string;
}


const text_of = (value: unknown): string | undefined => typeof value === 'string' && value !== '' ? value : undefined;

const path_id = (id: number | string): string => encodeURIComponent(String(id));


/** Nothing changes any more without someone starting it again */
export function is_final_status(status: string): boolean {
  return status === 'finished' || status === 'canceled';
}


/** Deployments of a project, newest first */
export async function list_deployments(base: string, token: string, project: string, signal?: AbortSignal): Promise<DeploymentSummary[]> {
  const data = await request(base, token, 'GET', `list_deployments/${encodeURIComponent(project)}`, undefined, signal);
  if (!Array.isArray(data))
    throw new IReleaserError('Unexpected answer of list_deployments');

  const deployments: DeploymentSummary[] = [];
  for (const entry of data) {
    if (!is_object(entry) || !is_id(entry['meta_file_id']) || typeof entry['status'] !== 'string')
      continue;
    const deployment: DeploymentSummary = { id: entry['meta_file_id'], status: entry['status'] };
    if (is_id(entry['version']))
      deployment.version = entry['version'];
    for (const [key, field] of [['workflow', 'workflow_name'], ['commit', 'commit'], ['create_time', 'create_time'], ['update_time', 'update_time']] as const) {
      const value = text_of(entry[field]);
      if (value !== undefined)
        deployment[key] = value;
    }
    deployments.push(deployment);
  }
  return deployments;
}


/**
 * Projects of the view: the `project` of deployment.toml; otherwise those of the configured workflows
 * (default-workflow, workflows) that i-Releaser knows; otherwise those of all its workflows. In order, no duplicates.
 */
export function deployment_projects(definitions: readonly WorkflowDefinition[], config: { project?: unknown; 'default-workflow'?: unknown; workflows?: unknown }): string[] {

  const project = typeof config.project === 'string' ? config.project.trim() : '';
  if (project !== '')
    return [project];

  // i-Releaser finds workflows by name without case
  const named = configured_workflows([config['default-workflow'], ...configured_workflows(config.workflows)]).map(name => name.toLowerCase());
  const configured = definitions.filter(definition => named.includes(definition.name.toLowerCase()));
  const projects = (configured.length > 0 ? configured : definitions)
    .map(definition => definition.default_project)
    .filter((name): name is string => name !== undefined);
  return [...new Set(projects)];
}


/** `run-stages` of deployment.toml: no list means all stages (as far as the token's user may) */
export function may_run_stage(stage_name: string, run_stages: unknown): boolean {
  const allowed = configured_workflows(run_stages).map(name => name.toLowerCase());
  return allowed.length === 0 || allowed.includes(stage_name.toLowerCase());
}


/** How a stage can be run from VS Code: ready → continue; failed → continue or run_all; nothing for final deployments */
export function stage_options(deployment_status: string, stage: StageState, run_stages: unknown): StageOption[] {
  if (is_final_status(deployment_status) || !may_run_stage(stage.name, run_stages))
    return [];
  if (stage.status === 'ready')
    return ['continue'];
  if (stage.status === 'failed')
    return ['continue', 'run_all'];
  return [];
}


/** The step whose log explains why a failed stage failed */
export function failed_step(stage: StageState): StepState | undefined {
  return stage.steps.find(step => step.status === 'failed' && step.last_run !== undefined);
}


/** Runs a stage in the background */
export async function run_stage(base: string, token: string, id: number | string, stage_id: number | string, option: StageOption, signal?: AbortSignal): Promise<RunStageAnswer> {
  if (option !== 'continue' && option !== 'run_all')
    throw new IReleaserError(`Invalid option ${String(option)}`);
  const data = await request(base, token, 'POST', `run_stage/${path_id(id)}/${path_id(stage_id)}/${option}`, undefined, signal);
  if (!is_object(data) || data['status'] !== 'success')
    throw new IReleaserError(is_object(data) && typeof data['message'] === 'string' ? data['message'] : 'Unexpected answer of run_stage');

  const answer: RunStageAnswer = {};
  if (typeof data['mode'] === 'string')
    answer.mode = data['mode'];
  if (is_id(data['job_id']))
    answer.job_id = data['job_id'];
  if (typeof data['service_running'] === 'boolean')
    answer.service_running = data['service_running'];
  return answer;
}


/** Cancels a deployment; a stage that is already running is not stopped */
export async function cancel_deployment(base: string, token: string, id: number | string, signal?: AbortSignal): Promise<void> {
  const data = await request(base, token, 'POST', `cancel_deployment/${path_id(id)}`, undefined, signal);
  if (!is_object(data) || data['status'] !== 'success')
    throw new IReleaserError(is_object(data) && typeof data['message'] === 'string' ? data['message'] : 'Unexpected answer of cancel_deployment');
}


/** One run of a step; undefined if i-Releaser doesn't have it */
export async function get_action_log(base: string, token: string, run_id: number | string, signal?: AbortSignal): Promise<ActionLog | undefined> {
  const data = await request(base, token, 'GET', `get_action_log/${path_id(run_id)}`, undefined, signal);
  if (!is_object(data))
    throw new IReleaserError('Unexpected answer of get_action_log');
  if (Object.keys(data).length === 0)
    return undefined;
  const log: ActionLog = { stdout: typeof data['stdout'] === 'string' ? data['stdout'] : '', stderr: typeof data['stderr'] === 'string' ? data['stderr'] : '' };
  const status = text_of(data['status']);
  if (status !== undefined)
    log.status = status;
  const time = text_of(data['create_time']);
  if (time !== undefined)
    log.create_time = time;
  return log;
}
