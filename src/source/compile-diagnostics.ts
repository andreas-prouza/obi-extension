import * as vscode from 'vscode';
import * as path from 'path';


export async function show_diagnostic_infos() {


	const diagnosticCollection = vscode.languages.createDiagnosticCollection('obi-compiler');
	
        const editor = vscode.window.activeTextEditor;
        
        if (editor) {
            const uri = editor.document.uri;

            // 2. Define where the error is (Line 5, Char 0 to Line 5, Char 10)
            // Note: VS Code lines are 0-indexed (Line 1 in RPG is 0 in VS Code)
            const range = new vscode.Range(4, 0, 4, 10);

            // 3. Create the diagnostic object
            const diagnostic = new vscode.Diagnostic(
                range,
                "RNF7030: The name or indicator is not defined.",
                vscode.DiagnosticSeverity.Information
            );

            // Optional: Add a code/ID for the error
            diagnostic.code = 'RNF7030';
            diagnostic.source = 'IBM i Compiler';

            // 4. Update the collection for this specific file
            // This will immediately show the "red squiggle" in the editor
            diagnosticCollection.set(uri, [diagnostic]);
        }
    //context.subscriptions.push(diagnosticCollection, disposable);
}