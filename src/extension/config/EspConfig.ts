import * as vscode from 'vscode';
import * as path from 'path';
import { DirTool } from '../utilities/DirTool';
import { Constants } from '../../shared/Constants';
import { Workspace, WorkspaceSettings } from '../utilities/Workspace';
import { is_safe_profile_alias } from '../../shared/Profile';
import { CachedFiles } from '../../shared/CachedFiles';


// Define the shape of a single step
export class Step {
    add_default_steps: boolean = true;

    step?: string|undefined = undefined; // e.g., "global.cmds.cmd-id"

    /** A command to run instead of a step; it wins over `step` (as in the OBI backend) */
    cmd?: string|undefined = undefined;
    
    // Record<string, any> allows the free-text JSON properties we set up earlier
    properties: Record<string, any> = {}; 
    
    // Optional because some steps don't have an exit_point_script
    exit_point_script?: string; 
}

// Define the shape of the main configuration block
export class ExtendedSourceProcessing {
    use_regex: boolean = false;
    allow_multiple_matches: boolean = true;
    
    // Name: a variable of the source. A string is compared with its value, a list with the source name: {"SOURCE": ["mylib/*"]}
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
        const file_data = data ? { has_content: data.length > 0, blocks: data } : ExtendedSourceProcessingList.read_file(file_path);
        this.has_content = file_data.has_content;
        this.extended_source_processing = file_data.blocks.map((esp: any) => ExtendedSourceProcessingList.convert_dict_to_ESP(esp));
    }


    /**
     * The file has any content (as in the OBI backend: a user file with content replaces the project file, even
     * with an empty list of rules). A missing, empty or invalid file has none.
     */
    has_content: boolean = false;


    private static readonly _cache = new Map<string, CachedFiles<{ has_content: boolean; blocks: unknown[] }>>();

    /** The blocks of an ESP file, read again only after a change */
    private static read_file(file_path: string): { has_content: boolean; blocks: any[] } {
        const file = path.join(Workspace.get_workspace(), file_path);
        let cache = ExtendedSourceProcessingList._cache.get(file);
        if (!cache) {
            cache = new CachedFiles(() => [file], files => {
                const toml = DirTool.file_exists(files[0]) ? DirTool.get_toml(files[0]) : undefined;
                const blocks = toml?.extended_source_processing;
                return { has_content: typeof toml === 'object' && toml !== null && Object.keys(toml).length > 0, blocks: Array.isArray(blocks) ? blocks : [] };
            });
            ExtendedSourceProcessingList._cache.set(file, cache);
        }
        // They become editable objects: a copy keeps the cached data unchanged
        return structuredClone(cache.get());
    }


    private static convert_dict_to_ESP(dict: any): ExtendedSourceProcessing {
        const esp = new ExtendedSourceProcessing();
        // ?? instead of ||: false must stay false
        esp.use_regex = dict.use_regex ?? false;
        esp.allow_multiple_matches = dict.allow_multiple_matches ?? true;
        esp.conditions = dict.conditions || {};
        esp.steps = (dict.steps || []).map((step: any) => {
            const stepObj = new Step();
            // A plain name ("global.cmds.x"): only this step, as in the OBI backend
            if (typeof step === 'string') {
                stepObj.step = step;
                stepObj.add_default_steps = false;
                return stepObj;
            }
            stepObj.cmd = typeof step.cmd === 'string' && step.cmd.length > 0 ? step.cmd : undefined;
            // Default as in the OBI backend: true for a step, false for a raw cmd
            stepObj.add_default_steps = step.add_default_steps ?? !stepObj.cmd;
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
        
        if (workspace_settings.current_profile && is_safe_profile_alias(workspace_settings.current_profile)) {
        return ExtendedSourceProcessingList.convert_profile_alias_to_file(workspace_settings.current_profile);
        }

        return Constants.EXTENDED_SOURCE_PROCESS_CONFIG_USER;
    }




    public static convert_profile_alias_to_file(profile_alias: string): string | undefined {
        if (!is_safe_profile_alias(profile_alias))
            throw new Error(`Invalid profile name '${profile_alias}'`);
        return Constants.EXTENDED_SOURCE_PROCESS_CONFIG_USER.replace('.toml', `-${profile_alias}.toml`);
    }




    public add_new_esp_block(config: ExtendedSourceProcessing) {
        this.extended_source_processing.push(config);
        this.save_to_file();
    }
    
    public save_to_file() {
        const workspace_uri = Workspace.get_workspace_uri();
        if (!workspace_uri) {
            vscode.window.showErrorMessage(vscode.l10n.t('No workspace found. Cannot save ESP configuration.'));
            return;
        }
        const file_path = path.join(workspace_uri.fsPath, this.file_path);

        if (this.extended_source_processing.length === 0) {
            // An unreadable file also loads as an empty list: never delete it in that case
            DirTool.read_toml_strict(file_path);
            DirTool.delete_file(file_path);
            return;
        }

        DirTool.update_toml(file_path, { extended_source_processing: this.extended_source_processing });
    }
}