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

    quickPick.onDidChangeValue(async (value) => {
        if (value) {
            const value_lower = value.toLowerCase();
            quickPick.busy = true;
            const sourceList = await LocalSourceList.get_source_list();
            const filenameMatches = sourceList.filter(item => item.toLowerCase().includes(value_lower));

            const config = AppConfig.get_app_config();
            const sourceInfoPath = path.join(Workspace.get_workspace(), config.general['source-infos']);
            let descriptionMatches: ISourceInfos = [];
            if (sourceInfoPath && DirTool.file_exists(sourceInfoPath)) {
                const sourceInfos: ISourceInfos = DirTool.get_json(sourceInfoPath);
                //descriptionMatches = Object.entries(sourceInfos)
                //    .filter(([_, info]) => (info.description || '').toLowerCase().includes(value_lower));
                descriptionMatches = Object.fromEntries(
                        Object.entries(sourceInfos).filter(([, value]) =>
                            value.description.toLowerCase().includes(value_lower)
                        ))
                //descriptionMatches = sourceInfos.filter(info => (info.description || '').toLowerCase().includes(value_lower));
            }

            let items: vscode.QuickPickItem[] = [];
            if (filenameMatches.length > 0) {
                items.push(...filenameMatches.map(item => ({ label: item })));
            }

            //const descriptionMatchFiles = descriptionMatches.map(item => ({ label: item[0] }));
            //const uniqueDescriptionMatches = descriptionMatchFiles.filter(item => !filenameMatches.includes(item));

            if (Object.keys(descriptionMatches).length > 0) {
                //items.push({ label: 'Description Matches', kind: vscode.QuickPickItemKind.Separator });
                items.push(...Object.keys(descriptionMatches).map(item => ({ label: item })));
            }

            items = [{ label: '--- Filename Matches ---'}, { label: '--- Filename Matches 2 ---'}];

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
