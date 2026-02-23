import * as vscode from 'vscode';
import { LocalSourceList } from './utilities/LocalSourceList';
import { OBITools } from './utilities/OBITools';
import { AppConfig } from './webview/controller/AppConfig';
import * as path from 'path';
import { Workspace } from './utilities/Workspace';
import { IQualifiedSource, ISourceInfos } from './obi/Source';
import * as fs from 'fs';
import { DirTool } from './utilities/DirTool';


export function sourceQuickSearch() {
    const quickPick = vscode.window.createQuickPick();
    quickPick.placeholder = 'Search for a source file';
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;

    quickPick.onDidChangeValue(async (value) => {
        if (value) {
            const value_lower = value.toLowerCase();
            quickPick.busy = true;
            const sourceInfoList: ISourceInfos = await LocalSourceList.get_source_info_list();
  
            const descriptionMatches = Object.fromEntries(
                Object.entries(sourceInfoList).filter(([sub_key, sub_value]) =>{
                        const keyMatch = sub_key.toLowerCase().includes(value_lower);
                        const descriptionMatch = ((sub_value || {}).description||'').toLowerCase().includes(value_lower);

                        return keyMatch || descriptionMatch;
                    })
            );

            let items: vscode.QuickPickItem[] = [];

            if (Object.keys(descriptionMatches).length > 0) {
                //items.push({ label: 'Description Matches', kind: vscode.QuickPickItemKind.Separator });
                items.push(...Object.entries(descriptionMatches).map(([key1, value1]) => {
                    return { label: key1, description: (value1||{}).description || '' }
                }));
            }

            quickPick.items = items;
            quickPick.busy = false;
        } else {
            quickPick.items = [];
        }
    });

    quickPick.onDidChangeSelection(selection => {
        if (selection[0]) {
            const config = AppConfig.get_app_config();
            const source_dir = path.join(Workspace.get_workspace(), config.general['source-dir'] || 'src');

            const filePath = path.join(source_dir, selection[0].label);
            const fileUri = vscode.Uri.file(filePath);
            vscode.commands.executeCommand('vscode.open', fileUri);
            quickPick.hide();
        }
    });

    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
}
