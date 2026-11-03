import * as vscode from 'vscode';


/** Template keys that are ids, not the English text (vscode.l10n is keyed by the English text) */
const TEXT_IDS: Record<string, string> = {
  "Empty folder": "Show empty folders",
  "List of steps and its properties": "List of steps and their properties",
  "Local OBI path (if exist)": "Local OBI path (optional)",
  "Local path": "Local path ('.' = current workspace)",
  "OBI invalid!": "OBI configuration incomplete!",
  "Remote ifs path": "On IBM i: remote ifs path",
  "This config will contains definitions for the whole project team (remote host, remote obi path, ...)": "This configuration contains the definitions for the whole project team (remote host, remote OBI path, ...)",
  "This config will override the project config and should contain user specific definitions (target lib mapping, local obi path, ...)": "This configuration overrides the project configuration and contains user-specific definitions (target library mapping, local OBI path, ...)",
  "Tip: Add default steps": "This adds all steps of the standard processing of the source.\nYou can adjust the properties and the hook script of each step afterwards.",
  "Tip: Hook": "A hook is a custom python script that will be executed when generating the build commands for a source. \nYou can use it to adjust the build commands or to execute custom actions during the build process. \nThe script is stored in .obi/etc/scripts/\n\nYou need to use the python obi project for generating the build commands.",
  "Tip: Local OBI path": "Path to OBI on the local machine. \nOBI generates the build commands. \nExample (Win): %UserProfile%\\Documents\\obi",
  "Tip: Remote ifs path": "Path in the IFS on the remote IBM i system where the project sources should be stored. \nExample: /home/myuser/myproject\nAvailable variables: ${workspaceFolderBasename}",
  "Tip: Remote OBI path": "Path in the IFS to OBI on the remote IBM i system. \nWe need OBI on our IBM i to run the build commands. \nExample: /apps/obi\n\nSetup: https://github.com/andreas-prouza/obi?tab=readme-ov-file#server-side",
  "Use profile": "Using profile",
};


/** get_text of the templates: translated with the l10n bundles; unknown keys are shown as they are */
export function template_text(key: string): string {
  return vscode.l10n.t(TEXT_IDS[key] ?? key);
}
