import * as vscode from 'vscode';
import { OBITools } from '../../utilities/OBITools';
import { DirTool } from '../../utilities/DirTool';
import * as path from 'path';
import { Constants } from '../../Constants';
import { Workspace, WorkspaceSettings } from '../../utilities/Workspace';
import { workspace } from 'vscode';


// Define the shape of a single step
export class Step {
    use_standard_step: boolean = true;

    step: string|undefined = undefined; // e.g., "global.cmds.cmd-id"
    
    // Record<string, any> allows the free-text JSON properties we set up earlier
    properties: Record<string, any> = {}; 
    
    // Optional because some steps don't have an exit_point_script
    exit_point_script?: string; 
}

// Define the shape of the main configuration block
export class ExtendedSourceProcessing {
    use_regex: boolean = false;
    allow_multiple_matches: boolean = true;
    
    // Allows flexible conditions like {"SOURCE_FILE_NAME": ["*.pgm"]}
    conditions: Record<string, any> = {}; 
    
    steps: Step[] = [];
}

// Define the root object that matches the parsed TOML
export class ExtendedSourceProcessingList {
    extended_source_processing: ExtendedSourceProcessing[] = [];


    constructor() {
        const toml_data = DirTool.get_toml(path.join(Workspace.get_workspace_uri().fsPath, Constants.EXTENDED_SOURCE_PROCESS_CONFIG_TOML));
        this.extended_source_processing = toml_data.extended_source_processing || [];
    }

    public add_new_esp_block(config: ExtendedSourceProcessing) {
        this.extended_source_processing.push(config);
        this.save_to_file();
    }
    
    private save_to_file() {
        const workspace_uri = Workspace.get_workspace_uri();
        if (!workspace_uri) {
            vscode.window.showErrorMessage("No workspace found. Cannot save ESP configuration.");
            return;
        }
        const file_path = path.join(workspace_uri.fsPath, Constants.EXTENDED_SOURCE_PROCESS_CONFIG_TOML);
        DirTool.write_toml(file_path, { extended_source_processing: this.extended_source_processing });
    }
}