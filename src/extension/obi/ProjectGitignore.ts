// Recommended .gitignore entries of an OBI project.
// No vscode imports: this module is unit-tested in plain Node.


/** Personal configuration and generated files (see asserts/docs/configuration.md, "Files in the .obi folder") */
export const GITIGNORE_LINES: string[] = [
  '# OBI: personal configuration',
  '.obi/etc/.user-app-config*.toml',
  '.obi/etc/.user-extended-source-processing-config*.toml',
  '.obi/etc/workspace-settings.json',
  '.obi/etc/object-builds.json',
  '',
  '# OBI: generated',
  '.obi/log/',
  '.obi/tmp/',
  '.obi/cache/',
  '.obi/build-output/',
  '.obi/build-history/',
  '.obi/etc/source-list-*.json',
];


const entries = (lines: string[]) => lines.map(line => line.trim()).filter(line => line.length > 0 && !line.startsWith('#'));


/** Recommended entries that `content` (an existing .gitignore) doesn't have yet */
export function missing_gitignore_entries(content: string): string[] {
  const existing = new Set(entries(content.split(/\r?\n/)));
  return entries(GITIGNORE_LINES).filter(entry => !existing.has(entry));
}


/** `content` with the missing entries appended; existing lines are never changed or removed */
export function with_gitignore_entries(content: string): string {
  const missing = new Set(missing_gitignore_entries(content));
  if (missing.size === 0)
    return content;

  // Sections of GITIGNORE_LINES (comment + entries, separated by empty lines) that have missing entries
  const sections: string[][] = [[]];
  for (const line of GITIGNORE_LINES) {
    if (line === '')
      sections.push([]);
    else
      sections[sections.length - 1].push(line);
  }
  const block = sections
    .map(section => section.filter(line => line.startsWith('#') || missing.has(line)))
    .filter(section => section.some(line => !line.startsWith('#')))
    .map(section => section.join('\n'))
    .join('\n\n');

  const separator = content.length === 0 ? '' : content.endsWith('\n') ? '\n' : '\n\n';
  return `${content}${separator}${block}\n`;
}
