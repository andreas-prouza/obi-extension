import * as path from 'path';
import { minimatch } from "minimatch";
import { OBIConstants } from './obi_constants';
import { getSourceProperties } from './properties';
import { DirTool } from '../../../utilities/DirTool';

export function getSteps(source: string, appConfig: any, extended_sources_config: any): Array<string | object> {
  let initSteps: Array<string | object> = [];
  if (appConfig.global?.steps?.['*ALL']) {
    initSteps = appConfig.global.steps['*ALL'];
  }

  const extendedSteps = getExtendedSteps(source, appConfig, extended_sources_config);
  if (extendedSteps) {
    return [...initSteps, ...extendedSteps];
  }

  return [...initSteps, ...getGlobalSteps(source, appConfig)];
}



function getGlobalSteps(source: string, appConfig: any): Array<string | object> {
  if (appConfig.global?.steps) {
    for (const extensionStep in appConfig.global.steps) {
      if (source.endsWith(extensionStep)) {
        return appConfig.global.steps[extensionStep];
      }
    }
  }

  const fileExtensions = path.extname(source).slice(1);
  return appConfig.global?.steps?.[fileExtensions] || [];
}



function getExtendedSteps(source: string, appConfig: any, extended_sources_config: any): Array<string | object> | null {
  if (!extended_sources_config?.extended_source_processing) {
    return null;
  }

  const sourceProperties = getSourceProperties(appConfig, source);
  let resultSteps: Array<string | object> = [];
  let allowMultipleMatches = true;

  for (const sourceConfigEntry of extended_sources_config.extended_source_processing) {
    if (matchSourceConditions(sourceConfigEntry, source, sourceProperties)) {
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

    let stepsToAppend: any[] = [];
    if (step.step) {
      stepsToAppend.push({ step: step.step });
    }
    if (step.use_standard_step) {
      const globalSteps = getGlobalSteps(source, appConfig);
      stepsToAppend = stepsToAppend.concat(globalSteps.map(gs => ({ step: gs })));
    }

    for (const stepToAppend of stepsToAppend) {
      // Scripting part is omitted for brevity
      newSteps.push({ ...step, ...stepToAppend });
    }
  }
  return newSteps;
}

function matchSourceConditions(sourceConfigEntry: any, source: string, sourceProperties: any): boolean {
  const conditions = sourceConfigEntry.conditions || {};
  if (Object.keys(conditions).length === 0) {
    return true;
  }

  for (const conditionName in conditions) {
    const conditionValue = conditions[conditionName];
    switch (conditionName) {
      case 'SOURCE_FILE_NAMES':
        if (!matchConditionSourceFileNames(source, conditionValue, sourceConfigEntry)) {
          return false;
        }
        break;
      case 'TARGET_LIB':
        if (!matchConditionTargetLib(sourceProperties.TARGET_LIB, conditionValue, sourceConfigEntry)) {
          return false;
        }
        break;
      default:
        return false;
    }
  }
  return true;
}

function matchConditionSourceFileNames(source: string, conditionValues: string[], sourceConfigEntry: any): boolean {
  for (const conditionValue of conditionValues) {
    if (sourceConfigEntry.use_regex) {
      if (new RegExp(conditionValue).test(source)) {
        return true;
      }
    } else if (fnmatch(source, conditionValue)) {
      return true;
    }
  }
  return false;
}

function matchConditionTargetLib(targetLib: string, conditionValue: string, sourceConfigEntry: any): boolean {
  if (sourceConfigEntry.use_regex) {
    return new RegExp(conditionValue).test(targetLib);
  }
  return fnmatch(targetLib, conditionValue);
}


function fnmatch(source: string, conditionValue: string): boolean {
  // Use minimatch for glob pattern matching
  return minimatch(source, conditionValue, { matchBase: true });
}

