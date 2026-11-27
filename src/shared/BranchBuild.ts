// Branch build: what the extension needs to know about the backend's feature (obi/docs/branch-build.md).
// The backend computes tickets and libraries; the extension never does (Python regex). No vscode imports.


/** Backend version that knows branch builds (--branch, build_context, branch_libs) */
export const BRANCH_BUILD_BACKEND_VERSION = 6;


/** `[branch-build]` of the config (only the keys the extension reads) */
export interface BranchBuildSection {
  enabled?: unknown;
  'ticket-pattern'?: unknown;
  'lib-name'?: unknown;
  [key: string]: unknown;
}


/** The backend's rule: the section exists and doesn't set enabled = false (only the boolean) */
export function branch_build_active(section: unknown): boolean {
  return typeof section === 'object' && section !== null && !Array.isArray(section) && (section as BranchBuildSection).enabled !== false;
}


/** `build_context` of a compile list (written by the backend's create while the feature is on) */
export interface BuildContext {
  mode: 'branch' | 'main';
  branch: string | null;
  ticket: string | null;
  /** Lower case, e.g. #aa_337 */
  libs: string[];
  warning?: string;
  error?: { lib?: string; stderr?: string; [key: string]: unknown };
}


/** The build context of a compile list; undefined without one (feature off) or if it isn't valid */
export function build_context_of(compile_list: unknown): BuildContext | undefined {
  if (typeof compile_list !== 'object' || compile_list === null)
    return undefined;
  const context = (compile_list as Record<string, unknown>)['build_context'];
  if (typeof context !== 'object' || context === null || Array.isArray(context))
    return undefined;
  const c = context as Record<string, unknown>;
  if (c['mode'] !== 'branch' && c['mode'] !== 'main')
    return undefined;
  const text = (value: unknown) => typeof value === 'string' && value !== '' ? value : null;
  return {
    mode: c['mode'],
    branch: text(c['branch']),
    ticket: text(c['ticket']),
    libs: Array.isArray(c['libs']) ? c['libs'].filter((lib): lib is string => typeof lib === 'string') : [],
    warning: typeof c['warning'] === 'string' ? c['warning'] : undefined,
    error: typeof c['error'] === 'object' && c['error'] !== null ? c['error'] as BuildContext['error'] : undefined,
  };
}


/** Library names compared as on IBM i: without case */
export function same_lib(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase();
}


/**
 * Spec B7: a list may only be run on the branch it was created on. The backend checks the ticket in create and
 * add_source, but not in run. The extension can't compute tickets, so it compares the branch names.
 * Returns the branch of the list if it differs from the current one, otherwise undefined.
 */
export function branch_mismatch(context: BuildContext | undefined, current_branch: string | undefined): string | undefined {
  if (!context)
    return undefined;
  const created_on = context.branch ?? '';
  return created_on !== (current_branch ?? '') ? (context.branch ?? '?') : undefined;
}


/** OBI_BACKEND_VERSION of module/obi_constants.py; undefined if it isn't there */
export function backend_version_of(obi_constants_py: string): number | undefined {
  const match = /^[ \t]*OBI_BACKEND_VERSION[ \t]*=[ \t]*(\d+)/m.exec(obi_constants_py);
  return match ? Number.parseInt(match[1], 10) : undefined;
}


/** argparse of a backend older than branch builds */
export function is_unknown_branch_argument(line: string): boolean {
  return /unrecognized arguments:.*--branch/.test(line);
}


/** `--branch=<branch>` for create/add_source; none without a branch (detached HEAD, no git) */
export function branch_args(branch: string | undefined): string[] {
  return branch ? [`--branch=${branch}`] : [];
}


/** Status bar text: `#337 → #aa_337, #bb_337` or `main libraries` */
export function context_label(context: BuildContext): { ticket?: string; libs: string } {
  if (context.mode === 'branch')
    return { ticket: context.ticket ?? undefined, libs: context.libs.join(', ') };
  return { libs: '' };
}


export interface GuardInput {
  /** [i-releaser] main-branch of deployment.toml; empty: rule D1 is off */
  main_branch: string;
  /** Branch build is on: rules D2-D4 */
  feature_active: boolean;
  /** `git` of the compile list (written when it was created) */
  git?: { branch?: string; commit?: string; dirty?: boolean };
  context?: BuildContext;
  /** The compile list is a package build */
  is_package: boolean;
  /** git.commit is on origin/<main-branch>; undefined: not checked (no commit) */
  commit_on_main?: boolean;
}


export type GuardReason = { rule: 'D1' | 'D2' | 'D3' | 'D4'; kind: 'no-git' | 'branch' | 'commit' | 'mode' | 'package' | 'dirty'; value?: string };


/** Spec 4.4: why a deployment of this compile list isn't allowed (empty: allowed) */
export function deployment_guard(input: GuardInput): GuardReason[] {
  const reasons: GuardReason[] = [];
  if (input.main_branch !== '') {
    if (!input.git?.branch || !input.git.commit)
      reasons.push({ rule: 'D1', kind: 'no-git' });
    else if (input.git.branch !== input.main_branch)
      reasons.push({ rule: 'D1', kind: 'branch', value: input.git.branch });
    else if (input.commit_on_main !== true)
      reasons.push({ rule: 'D1', kind: 'commit', value: input.git.commit });
  }
  if (input.feature_active) {
    if (input.context?.mode !== 'main')
      reasons.push({ rule: 'D2', kind: 'mode', value: input.context?.branch ?? undefined });
    if (!input.is_package)
      reasons.push({ rule: 'D3', kind: 'package' });
    if (input.git?.dirty === true)
      reasons.push({ rule: 'D4', kind: 'dirty' });
  }
  return reasons;
}


/** A branch library on IBM i (`-a branch_libs --list`); names in upper case */
export interface BranchLib {
  name: string;
  env?: string | null;
  ticket?: string | null;
  text?: string;
  created?: string | null;
  last_used?: string | null;
  owner?: string;
  size?: number | null;
}


/** Result of `-a branch_libs`: the last JSON line of stdout with a status */
export function parse_branch_libs_output(stdout: string): { status: string; message?: string; libs?: BranchLib[]; deleted?: string[]; failed?: { name: string; message: string }[] } | undefined {
  const lines = stdout.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('{'));
  for (const line of lines.reverse()) {
    try {
      const result = JSON.parse(line);
      if (typeof result === 'object' && result !== null && typeof result.status === 'string')
        return result;
    }
    catch {
      // other output
    }
  }
  return undefined;
}


/**
 * The text a branch library of `branch` gets (backend: get_branch_text): `OBI <branch>`, characters other than
 * letters, digits, `.`, `_`, `/` and `-` replaced by `_`, at most 50 characters. The extension compares it with the
 * texts of the libraries instead of reading the branch from a (possibly shortened) text.
 */
export function lib_text_of_branch(branch: string): string {
  // u: per character, as Python (an emoji is one character, not two UTF-16 units)
  return `OBI ${branch.replace(/[^A-Za-z0-9._/-]/gu, '_')}`.slice(0, 50).trimEnd();
}


/** The existing branch whose library text is `text`: local branches first, then those of origin ("origin/x" → "x") */
export function branch_for_text(text: string | undefined, local: string[], remote: string[]): string | undefined {
  if (!text)
    return undefined;
  const names = [...local, ...remote.map(name => name.replace(/^origin\//, ''))];
  return names.find(name => lib_text_of_branch(name) === text.trim());
}


export type TicketState = 'active' | 'merged' | 'orphaned' | 'unknown';


/** git facts of a branch, after `git fetch --prune` */
export interface BranchFacts {
  local: boolean;
  remote: boolean;
  /** The local branch had an upstream that was deleted on origin (git: [gone]), e.g. after a squash merge */
  upstream_gone: boolean;
  /** Contained in origin/<main-branch> */
  merged: boolean;
}


/**
 * State of a ticket's libraries (spec 4.6):
 * - merged: the branch is in the main branch, or its remote branch was deleted (upstream gone)
 * - orphaned: the libraries have an OBI text, but no branch has that text
 * - active: the branch exists and isn't merged (also a local branch that was never pushed)
 * - unknown: no OBI text (e.g. own crt-branch-lib), so the branch isn't known
 */
export function ticket_state(text: string | undefined, branch: string | undefined, facts: BranchFacts | undefined): TicketState {
  if (!branch)
    return /^OBI \S/.test((text ?? '').trim()) ? 'orphaned' : 'unknown';
  if (!facts)
    return 'unknown';
  if (facts.merged || facts.upstream_gone)
    return 'merged';
  return 'active';
}


export interface TicketLibs {
  ticket: string;
  /** Text of the first library (OBI <branch>) */
  text?: string;
  libs: BranchLib[];
  /** Newest last use of its libraries */
  last_used?: string;
}


/** The libraries grouped by ticket, in the order of the list */
export function group_by_ticket(libs: BranchLib[]): TicketLibs[] {
  const groups = new Map<string, TicketLibs>();
  for (const lib of libs) {
    const ticket = lib.ticket ?? '?';
    const group = groups.get(ticket) ?? { ticket, libs: [] };
    group.libs.push(lib);
    group.text ??= lib.text || undefined;
    if (lib.last_used && (!group.last_used || lib.last_used > group.last_used))
      group.last_used = lib.last_used;
    groups.set(ticket, group);
  }
  return [...groups.values()];
}
