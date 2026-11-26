import { fnmatch, match_conditions } from '../../../../shared/EspConditions';
import { source_type } from '../../../../shared/SourceName';
import { logger } from '../../../utilities/Logger';
import { getSourceProperties } from './properties';
import { ExtendedSourceProcessingList } from '../../../config/EspConfig';
import { BuildListContext } from './context';

/**
 * The ESP rules used for the build list, as in the OBI backend (get_extended_steps): the user file of the active
 * profile if it has any content, otherwise the project file. The files are not merged.
 */
export function getActiveExtendedSourcesConfig(): any {
  const user_config = new ExtendedSourceProcessingList(true);
  const config = user_config.has_content ? user_config : new ExtendedSourceProcessingList();
  return {
    extended_source_processing: config.extended_source_processing || [],
    // Condition names already reported as unknown: once per build list, not once per source
    unknown_conditions: new Set<string>()
  };
}

export function getSteps(source: string, appConfig: any, extended_sources_config: any, ctx?: BuildListContext): Array<string | object> {
  let initSteps: Array<string | object> = [];
  if (appConfig.global?.steps?.['*ALL']) {
    initSteps = appConfig.global.steps['*ALL'];
  }

  const extendedSteps = getExtendedSteps(source, appConfig, extended_sources_config, ctx);
  if (extendedSteps) {
    return [...initSteps, ...extendedSteps];
  }

  return [...initSteps, ...getGlobalSteps(source, appConfig)];
}



/**
 * Steps of [global.steps] for a source, as in the backend (get_global_steps): a key that is the source name,
 * else the first key that matches it as a pattern (fnmatch, e.g. "mylib/*"), else the key of its type ("rpgle.pgm").
 */
function getGlobalSteps(source: string, appConfig: any): Array<string | object> {
  const steps: Record<string, Array<string | object>> = appConfig.global?.steps ?? {};
  if (Object.prototype.hasOwnProperty.call(steps, source))
    return steps[source];
  for (const key of Object.keys(steps)) {
    if (fnmatch(source, key))
      return steps[key];
  }
  return steps[source_type(source)] || [];
}



function getExtendedSteps(source: string, appConfig: any, extended_sources_config: any, ctx?: BuildListContext): Array<string | object> | null {
  if (!extended_sources_config?.extended_source_processing) {
    return null;
  }
  // "Activate extended source processing" on the config page; on by default, as in the Python OBI
  const use_esp = appConfig.global?.settings?.general?.USE_ESP;
  if (use_esp === false || use_esp === 'false') {
    return null;
  }

  const sourceProperties = getSourceProperties(appConfig, source, ctx);
  let resultSteps: Array<string | object> = [];
  let allowMultipleMatches = true;

  for (const sourceConfigEntry of extended_sources_config.extended_source_processing) {
    if (matchSourceConditions(sourceConfigEntry, source, sourceProperties, extended_sources_config.unknown_conditions)) {
      if (!allowMultipleMatches && resultSteps.length > 0) {
        throw new Error(`Multiple extended source processing entries found for ${source}`);
      }
      allowMultipleMatches = sourceConfigEntry.allow_multiple_matches ?? true;
      const steps = getStepsFromCurrentEsp(sourceConfigEntry, source, appConfig, sourceProperties);
      resultSteps.push(...steps);
    }
  }

  return resultSteps.length > 0 ? resultSteps : null;
}

function getStepsFromCurrentEsp(
  sourceConfigEntry: any,
  source: string,
  appConfig: any,
  sourceProperties: any
): Array<string | object> {
  const steps = sourceConfigEntry.steps || [];
  const newSteps: Array<string | object> = [];

  for (const step of steps) {
    if (typeof step === 'string') {
      newSteps.push(step);
      continue;
    }
    if (typeof step !== 'object' || step === null) {
      throw new Error(`Step is not a dictionary or a string`);
    }

    // As in the OBI backend: a raw cmd runs once and replaces the default steps, unless they are requested
    const raw_cmd: string = typeof step.cmd === 'string' ? step.cmd : '';
    const add_default_steps: boolean = step.add_default_steps ?? raw_cmd.length === 0;
    const { cmd: _cmd, ...step_without_cmd } = step;

    let stepsToAppend: any[] = [];
    if (raw_cmd.length > 0) {
      stepsToAppend.push({ cmd: raw_cmd });
    }
    else if (step.step) {
      stepsToAppend.push({ step: step.step });
    }
    if (add_default_steps) {
      const globalSteps = getGlobalSteps(source, appConfig);
      stepsToAppend = stepsToAppend.concat(globalSteps.map(gs => ({ step: gs })));
    }

    for (const stepToAppend of stepsToAppend) {
      // Exit point scripts (Python) are only run by the OBI backend
      newSteps.push({ ...step_without_cmd, ...stepToAppend });
    }
  }
  return newSteps;
}

function matchSourceConditions(sourceConfigEntry: any, source: string, sourceProperties: any, reported?: Set<string>): boolean {
  return match_conditions(sourceConfigEntry.conditions, Boolean(sourceConfigEntry.use_regex), source, sourceProperties, name => {
    if (reported?.has(name))
      return;
    reported?.add(name);
    logger.warn(`Extended source processing: unknown condition name ${name} (no variable of that name, e.g. for ${source}): the rule doesn't match`);
  });
}

