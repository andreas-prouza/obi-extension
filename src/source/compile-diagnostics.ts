import * as vscode from 'vscode';
import { ISequentialFileReader, IMarkerCreator, ErrorInformationRecord, Parser } from '@ibm/ibmi-eventf-parser';
import { DirTool } from '../utilities/DirTool';

let diagnosticCollection: vscode.DiagnosticCollection|undefined = undefined;

class StringReader implements ISequentialFileReader {
    constructor(private lines: string[]) { }
    private currentIndex = 0;

    readNextLine(): string | undefined {
        if (this.currentIndex < this.lines.length) {
            return this.lines[this.currentIndex++];
        }
        return undefined;
    }
}

// Stays in-memory, so we can use it later
export interface Marker {
    file: string;
    line: number;
    text: string;
    sev: number;
    msgid: string;
}

class MarkerCreator implements IMarkerCreator {
    private markers: Marker[] = [];

    createMarker(record: ErrorInformationRecord, fileLocation: string) {
        this.markers.push({
            file: fileLocation,
            line: record.getStmtLine(),
            text: record.getMsg(),
            sev: record.getSevNum(),
            msgid: record.getMsgId(),
        });
    }

    public getMarkers(): Marker[] {
        return this.markers;
    }
}

export interface IQualifiedSource {
  "start-line": number,
  "start-char": number,
  "end-line": number,
  "end-char": number
}

export async function clear_diagnostics() {
    if (diagnosticCollection) {
        diagnosticCollection.clear();
    }
}

export async function show_diagnostic_infos(evfevent_file: string) {

    const eventfile_lines = (DirTool.get_file_content(evfevent_file)??'').split(/\r?\n/);
        
	if (!diagnosticCollection) {
		diagnosticCollection = vscode.languages.createDiagnosticCollection('obi-compiler');
	}
	
    const editor = vscode.window.activeTextEditor;
    
    if (editor) {
        const uri = editor.document.uri;
        diagnosticCollection.delete(uri);

        const parser = new Parser();
        const markerCreator = new MarkerCreator();
        parser.parse(new StringReader(eventfile_lines), markerCreator);

        const diagnostics: vscode.Diagnostic[] = [];
        for (const marker of markerCreator.getMarkers()) {
            // Note: VS Code lines are 0-indexed (Line 1 in RPG is 0 in VS Code)
            const range = new vscode.Range(Math.max(marker.line - 1, 0), 0, Math.max(marker.line - 1, 0), 100);

            let severity: vscode.DiagnosticSeverity;
            if (marker.sev < 10) {
                severity = vscode.DiagnosticSeverity.Information;
            } else if (marker.sev < 20) {
                severity = vscode.DiagnosticSeverity.Warning;
            } else {
                severity = vscode.DiagnosticSeverity.Error;
            }

            const diagnostic = new vscode.Diagnostic(
                range,
                marker.text,
                severity
            );
            // Optional: Add a code/ID for the error
            diagnostic.code = marker.msgid;
            diagnostic.source = 'IBM i Compiler';
            diagnostic.relatedInformation = [
                new vscode.DiagnosticRelatedInformation(
                    new vscode.Location(uri, range),
                    `Message ID: ${marker.msgid} | Severity: ${marker.sev}`
                )
            ];

            diagnostics.push(diagnostic);
        }

        diagnosticCollection.set(uri, diagnostics);
    }
    //context.subscriptions.push(diagnosticCollection, disposable);
}