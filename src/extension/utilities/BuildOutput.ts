import * as vscode from 'vscode';
import { register_command } from './Registration';
import { ExtensionSettings } from './ExtensionSettings';


/** Output channel "OBI Build": raw output of local OBI runs and remote commands, one header line per run */
export class BuildOutput {

  private static channel: vscode.OutputChannel | undefined;


  public static register(context: vscode.ExtensionContext): void {
    const channel = vscode.window.createOutputChannel('OBI Build');
    BuildOutput.channel = channel;
    context.subscriptions.push(channel, { dispose: () => { BuildOutput.channel = undefined; } });
    register_command(context, 'obi.build.show-output', () => BuildOutput.show());
  }


  public static start(title: string): void {
    BuildOutput.channel?.appendLine('');
    BuildOutput.channel?.appendLine(`=== ${title} · ${new Date().toLocaleString()} ===`);
    if (ExtensionSettings.build_reveal_output() === 'onStart')
      BuildOutput.show();
  }


  public static line(text: string): void {
    BuildOutput.channel?.appendLine(text);
  }


  public static finished(result: 'succeeded' | 'cancelled' | 'failed', detail?: string): void {
    BuildOutput.channel?.appendLine(`=== ${result}${detail ? `: ${detail}` : ''} ===`);
    if (result === 'failed' && ExtensionSettings.build_reveal_output() === 'onError')
      BuildOutput.show();
  }


  public static show(): void {
    BuildOutput.channel?.show(true);
  }
}
