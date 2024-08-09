import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";

import { execSync } from "child_process";
import { BuildSummary } from '../webview/show_changes/BuildSummary';
import { OBIStatus } from './OBIStatus';
import { OBIController } from '../webview/controller/OBIController';




export class OBICommands {

  public static status: OBIStatus = OBIStatus.READY;



  public static run_build(context: vscode.ExtensionContext): void {

    if (OBICommands.status != OBIStatus.READY) {
      vscode.window.showErrorMessage('OBI process is already running');
      return;
    }

    OBICommands.status = OBIStatus.IN_PROCESS;

    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length == 0) {
      vscode.window.showErrorMessage('No workspace');
      return;
    }

    const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;

    const buff = execSync(`cd ${ws}; scripts/cleanup.sh   &&   scripts/run_build.sh`);

    BuildSummary.render(context.extensionUri, vscode.workspace.workspaceFolders[0].uri)

    OBICommands.status = OBIStatus.READY;
    OBIController.run_finished();
    OBIController.update_build_summary_timestamp();

    return;
  }



  public static show_changes(context: vscode.ExtensionContext): void {

    if (OBICommands.status != OBIStatus.READY) {
      vscode.window.showErrorMessage('OBI process is already running');
      return;
    }

    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length == 0) {
      vscode.window.showErrorMessage('No workspace');
      return;
    }

    OBICommands.status = OBIStatus.IN_PROCESS;

    const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;

    const buff = execSync(`cd ${ws}; scripts/cleanup.sh   &&   scripts/create_build_script.sh`);

    BuildSummary.render(context.extensionUri, vscode.workspace.workspaceFolders[0].uri)

    OBICommands.status = OBIStatus.READY;
    OBIController.run_finished();
    OBIController.update_build_summary_timestamp();

    return;
  }

}