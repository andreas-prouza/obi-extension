// Substitution of $(VARIABLE) placeholders in build commands.
// No vscode imports: this module is unit-tested in plain Node.


// $(KEY): anything without parentheses or whitespace, so keys like "global.cmds.add-lible" match,
// while shell command substitution such as $(echo x) never does.
const PLACEHOLDER = /\$\(([^()\s]+)\)/g;
const MAX_SUBSTITUTION_PASSES = 20;


/** CL keywords that may be omitted when their variable is not set. Keep in sync with the Python OBI. */
export const OPTIONAL_CMD_KEYWORDS: Record<string, string[]> = {
  ACTGRP:   ['ACTGRP'],
  BNDDIR:   ['INCLUDE_BNDDIR'],
  TGTRLS:   ['TGTRLS'],
  STGMDL:   ['STGMDL'],
  TGTCCSID: ['TGTCCSID'],
  DBGVIEW:  ['DBGVIEW'],
  INCDIR:   ['INCDIR_RPGLE', 'INCDIR_SQLRPGLE'],
};

const escape_regex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// KEYWORD() or KEYWORD($(VAR)) of an optional keyword, with the whitespace in front of it
const OPTIONAL_KEYWORD_PATTERNS: RegExp[] = Object.entries(OPTIONAL_CMD_KEYWORDS).map(([keyword, vars]) =>
  new RegExp(`\\s*\\b${keyword}\\(\\s*(?:\\$\\((?:${vars.map(escape_regex).join('|')})\\))?\\s*\\)`, 'gi'));



/**
 * Replaces $(KEY) placeholders with the string/number values of `variable_dict`, also nested ones.
 * Unknown placeholders stay. Throws if the substitution doesn't end (variables referencing themselves).
 */
export function replaceCmdParameters(cmd: string, variable_dict: Record<string, unknown>): string {
  const original = cmd;
  let replaced_in_last_pass: string[] = [];

  for (let pass = 0; pass < MAX_SUBSTITUTION_PASSES; pass++) {
    replaced_in_last_pass = [];
    // Replacement function: "$$" or "$&" inside a value are taken literally
    cmd = cmd.replace(PLACEHOLDER, (match: string, key: string) => {
      const value = variable_dict[key];
      if (typeof value !== 'string' && typeof value !== 'number')
        return match;
      replaced_in_last_pass.push(key);
      return String(value);
    });

    if (replaced_in_last_pass.length == 0)
      return removeUnresolvedCmdParameters(cmd);
  }

  throw new Error(
    `Variable substitution does not end for command '${original}'. ` +
    `Check these variables for references to themselves: ${[...new Set(replaced_in_last_pass)].join(', ')}`);
}



/** Removes optional keywords whose variable is not set (see OPTIONAL_CMD_KEYWORDS). */
export function removeUnresolvedCmdParameters(cmd: string): string {
  for (const pattern of OPTIONAL_KEYWORD_PATTERNS)
    cmd = cmd.replace(pattern, '');
  return cmd;
}



/** Names of placeholders that are still in the command and look like OBI variables (upper case). */
export function find_unresolved_placeholders(cmd: string): string[] {
  return [...cmd.matchAll(PLACEHOLDER)].map(match => match[1]).filter(name => /^[A-Z][A-Z0-9_]*$/.test(name));
}
