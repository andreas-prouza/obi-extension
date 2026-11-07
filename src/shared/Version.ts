// Version compare for vscode.version, e.g. to enable an API that is stable only from a certain release.
// No vscode imports: this module is unit-tested in plain Node.


/** major.minor.patch of "1.145.0", "1.145.0-insider"; undefined if it isn't such a version */
function parts(version: string): [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}


/** True if `version` is `minimum` or newer. An unknown version format is never enough. */
export function version_at_least(version: string, minimum: string): boolean {
  const have = parts(version);
  const need = parts(minimum);
  if (!have || !need)
    return false;
  for (let i = 0; i < 3; i++) {
    if (have[i] !== need[i])
      return have[i] > need[i];
  }
  return true;
}
