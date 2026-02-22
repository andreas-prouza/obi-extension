import * as vscode from 'vscode';
import { LocalSourceList } from './utilities/LocalSourceList';
import { OBITools } from './utilities/OBITools';
import { AppConfig } from './webview/controller/AppConfig';
import * as path from 'path';
import { Workspace } from './utilities/Workspace';
import { IQualifiedSource } from './obi/Source';
import * as fs from 'fs';


export function sourceQuickSearch() {
    const quickPick = vscode.window.createQuickPick();
    quickPick.placeholder = 'Search for a source file';

    quickPick.onDidChangeValue(async (value) => {
        if (value) {
            quickPick.busy = true;
            const sourceList = await LocalSourceList.get_source_list();
            const filenameMatches = sourceList.filter(item => item.toLowerCase().includes(value.toLowerCase()));

            const config = AppConfig.get_app_config();
            const sourceInfoPath = config.general['source-infos'];
            let descriptionMatches: IQualifiedSource[] = [];
            if (sourceInfoPath && fs.existsSync(sourceInfoPath)) {
                const sourceInfoContent = fs.readFileSync(sourceInfoPath, 'utf-8');
                const sourceInfos: IQualifiedSource[] = JSON.parse(sourceInfoContent);
                descriptionMatches = sourceInfos.filter(info => info.description && info.description.toLowerCase().includes(value.toLowerCase()));
            }

            const items: vscode.QuickPickItem[] = [];
            items.push(...filenameMatches.map(item => ({ label: item })));

            const descriptionMatchFiles = descriptionMatches.map(item => path.join(item.lib, item.file, `${item.mbr}.${item.ext}`));
            const uniqueDescriptionMatches = descriptionMatchFiles.filter(item => !filenameMatches.includes(item));

            if (uniqueDescriptionMatches.length > 0) {
                items.push({ label: 'Description Matches', kind: vscode.QuickPickItemKind.Separator });
                items.push(...uniqueDescriptionMatches.map(item => ({ label: item })));
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
