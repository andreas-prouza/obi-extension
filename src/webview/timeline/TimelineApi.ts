import * as vscode from 'vscode';
import { version_at_least } from '../../shared/Version';


/*
 * The Timeline API is stable from VS Code 1.145. The minimum version of this extension is older (engines.vscode),
 * and @types/vscode must not be newer than that, so the parts used here are declared locally.
 * Before 1.145 the API is proposed: it has another shape, and using it throws for extensions without the proposal.
 *
 * When engines.vscode is raised to 1.145 or newer: delete this file and use vscode.workspace.registerTimelineProvider,
 * vscode.TimelineItem, ... directly.
 */

export const TIMELINE_MIN_VERSION = '1.145.0';


export interface ObiTimelineItem {
  timestamp: number;
  label?: string;
  id?: string;
  iconPath?: vscode.ThemeIcon;
  description?: string;
  tooltip?: string | vscode.MarkdownString;
  command?: vscode.Command;
  contextValue?: string;
  accessibilityInformation?: vscode.AccessibilityInformation;
}

export interface ObiTimeline {
  /** Newest first */
  readonly items: readonly ObiTimelineItem[];
  readonly cursor?: string;
}

export enum ObiTimelineTriggerKind {
  Invoke = 1,
  Automatic = 2,
}

export interface ObiTimelineOptions {
  readonly cursor?: string;
  readonly limit?: number;
  readonly triggerKind: ObiTimelineTriggerKind;
}

export interface ObiTimelineProvider {
  readonly onDidChangeTimeline?: vscode.Event<vscode.Uri | vscode.Uri[] | undefined>;
  provideTimeline(uri: vscode.Uri, options: ObiTimelineOptions, token: vscode.CancellationToken): vscode.ProviderResult<ObiTimeline>;
}

export interface ObiWorkspaceTimelineProvider {
  readonly onDidChangeWorkspaceTimeline?: vscode.Event<void>;
  provideWorkspaceTimeline(options: ObiTimelineOptions, token: vscode.CancellationToken): vscode.ProviderResult<ObiTimeline>;
}

export interface TimelineApi {
  registerTimelineProvider(id: string, label: string, scheme: string | readonly string[], provider: ObiTimelineProvider): vscode.Disposable;
  registerWorkspaceTimelineProvider(id: string, label: string, provider: ObiWorkspaceTimelineProvider): vscode.Disposable;
  /** vscode.TimelineItem */
  create_item(label: string, timestamp: number): ObiTimelineItem;
}


interface StableTimelineNamespace {
  workspace: {
    registerTimelineProvider?: unknown;
    registerWorkspaceTimelineProvider?: unknown;
  };
  TimelineItem?: unknown;
}


/** The stable Timeline API, or undefined before VS Code 1.145 */
export function timeline_api(version: string = vscode.version): TimelineApi | undefined {
  if (!version_at_least(version, TIMELINE_MIN_VERSION))
    return undefined;

  try {
    const ns = vscode as unknown as StableTimelineNamespace;
    const register = ns.workspace.registerTimelineProvider;
    const register_workspace = ns.workspace.registerWorkspaceTimelineProvider;
    const item_class = ns.TimelineItem;
    if (typeof register !== 'function' || typeof register_workspace !== 'function' || typeof item_class !== 'function')
      return undefined;

    const ItemClass = item_class as new (label: string, timestamp: number) => ObiTimelineItem;
    return {
      registerTimelineProvider: (id, label, scheme, provider) => (register as TimelineApi['registerTimelineProvider']).call(ns.workspace, id, label, scheme, provider),
      registerWorkspaceTimelineProvider: (id, label, provider) => (register_workspace as TimelineApi['registerWorkspaceTimelineProvider']).call(ns.workspace, id, label, provider),
      create_item: (label, timestamp) => new ItemClass(label, timestamp),
    };
  }
  catch {
    return undefined;
  }
}
