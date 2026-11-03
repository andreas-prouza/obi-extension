import * as vscode from 'vscode';
import { LocalSourceList } from './extension/utilities/LocalSourceList';
import { DirTool } from './extension/utilities/DirTool';
import * as path from 'path';
import { ISourceInfos } from './shared/Source';


export async function sourceQuickSearch() {
    const quickPick: any = vscode.window.createQuickPick();
    quickPick.placeholder = 'Search for a source by name or description...';
    quickPick.matchOnDescription = true;
    const sourceInfoList: ISourceInfos = await LocalSourceList.get_source_info_list();
    quickPick.items = Object.entries(sourceInfoList).map(([key, value]) => {
        return { label: key, description: (value || {}).description || '' };
    });

    quickPick.onDidChangeSelection((selection: any) => {
        if (selection[0]) {
            // With local-base-dir, like the other views
            const filePath = path.join(DirTool.get_local_source_dir(), selection[0].label);
            const fileUri = vscode.Uri.file(filePath);
            vscode.commands.executeCommand('vscode.open', fileUri);
            quickPick.hide();
        }
    });

    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
}
