import * as vscode from 'vscode';
import * as path from 'path';
import { DirTool } from '../extension/utilities/DirTool';
import { Constants } from './Constants';
import { Workspace, WorkspaceSettings } from '../extension/utilities/Workspace';


// Define the shape of a single step
export class Step {
    add_default_steps: boolean = true;

    step?: string|undefined = undefined; // e.g., "global.cmds.cmd-id"
    
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
    user_config: boolean = false;
    file_path: string = '';


    constructor(user_config: boolean = false, data?: any) {

        this.user_config = user_config;

        let file_path: string = Constants.EXTENDED_SOURCE_PROCESS_CONFIG;
        if (user_config) {
            file_path = ExtendedSourceProcessingList.get_current_profile_config_name() || Constants.EXTENDED_SOURCE_PROCESS_CONFIG_USER;
        }
        this.file_path = file_path;
        const toml_data = data || DirTool.get_toml(path.join(Workspace.get_workspace_uri().fsPath, file_path))?.extended_source_processing || [];
        this.extended_source_processing = toml_data.map((esp: any) => ExtendedSourceProcessingList.convert_dict_to_ESP(esp));
    }


    private static convert_dict_to_ESP(dict: any): ExtendedSourceProcessing {
        const esp = new ExtendedSourceProcessing();
        esp.use_regex = dict.use_regex || false;
        esp.allow_multiple_matches = dict.allow_multiple_matches || true;
        esp.conditions = dict.conditions || {};
        esp.steps = (dict.steps || []).map((step: any) => {
            const stepObj = new Step();
            stepObj.add_default_steps = step.add_default_steps || true;
            stepObj.step = step.step;
            stepObj.properties = step.properties || {};
            stepObj.exit_point_script = step.exit_point_script;
            return stepObj;
        });
        return esp;
    }


  
    public static get_current_profile_config_name(): string | undefined {
        const workspace_settings: WorkspaceSettings | undefined = Workspace.get_workspace_settings();

        if (! workspace_settings) {
        return undefined;
        }
        
        if (workspace_settings.current_profile) {
        return ExtendedSourceProcessingList.convert_profile_alias_to_file(workspace_settings.current_profile);
        }

        return Constants.EXTENDED_SOURCE_PROCESS_CONFIG_USER;
    }




    public static convert_profile_alias_to_file(profile_alias: string): string | undefined {
        return Constants.EXTENDED_SOURCE_PROCESS_CONFIG_USER.replace('.toml', `-${profile_alias}.toml`);
    }




    public add_new_esp_block(config: ExtendedSourceProcessing) {
        this.extended_source_processing.push(config);
        this.save_to_file();
    }
    
    public save_to_file() {
        const workspace_uri = Workspace.get_workspace_uri();
        if (!workspace_uri) {
            vscode.window.showErrorMessage("No workspace found. Cannot save ESP configuration.");
            return;
        }
        const file_path = path.join(workspace_uri.fsPath, this.file_path);

        if (this.extended_source_processing.length === 0) {
            DirTool.delete_file(file_path);
            return;
        }

        DirTool.write_toml(file_path, { extended_source_processing: this.extended_source_processing });
    }
}