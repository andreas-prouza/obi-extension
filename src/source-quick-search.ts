import * as vscode from 'vscode';
import { LocalSourceList } from './utilities/LocalSourceList';
import { AppConfig } from './webview/controller/AppConfig';
import * as path from 'path';
import { Workspace } from './utilities/Workspace';
import { ISourceInfos } from './obi/Source';


export function sourceQuickSearch() {
    const quickPick = vscode.window.createQuickPick();
    quickPick.placeholder = 'Search for a source by name or description...';
    quickPick.matchOnDescription = true;
    // quickPick.matchOnDetail = true;

    quickPick.onDidChangeValue(async (value) => {
        
        if (!value) {
            quickPick.items = [];
            return;
        }

        quickPick.busy = true;
        const value_lower = value.toLowerCase();
        let items: vscode.QuickPickItem[] = [];
        const sourceInfoList: ISourceInfos = await LocalSourceList.get_source_info_list();

        const sourceInfoListMatches = Object.fromEntries(
            Object.entries(sourceInfoList).filter(([sub_key, sub_value]) =>{
                    const keyMatch = sub_key.toLowerCase().includes(value_lower);
                    const descriptionMatch = ((sub_value || {}).description||'').toLowerCase().includes(value_lower);

                    return keyMatch || descriptionMatch;
                })
        );

        const sourceMatches = Object.fromEntries(
            Object.entries(sourceInfoListMatches).filter(([sub_key, sub_value]) =>{
                    return sub_key.toLowerCase().includes(value_lower);
                })
        );

        const descriptionMatches = Object.fromEntries(
            Object.entries(sourceInfoList).filter(([sub_key, sub_value]) =>{
                    return ((sub_value || {}).description||'').toLowerCase().includes(value_lower);
                })
        );

        items.push({ label: 'File matches', kind: vscode.QuickPickItemKind.Separator });
        if (Object.keys(sourceMatches).length > 0) {
            items.push(...Object.entries(sourceMatches).map(([key1, value1]) => {
                return { label: key1, description: (value1||{}).description || '' }
            }));
        }

        items.push({ label: 'Description matches', kind: vscode.QuickPickItemKind.Separator });
        if (Object.keys(descriptionMatches).length > 0) {
            items.push({ label: `Description Matches ${value}`, kind: vscode.QuickPickItemKind.Separator, alwaysShow: true });
            items.push(...Object.entries(descriptionMatches).map(([key1, value1]) => {
                return { label: key1, description: (value1||{}).description || '' }
            }));
        }

        quickPick.items = items;
        quickPick.busy = false;
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
