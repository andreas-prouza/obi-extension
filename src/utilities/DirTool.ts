import { ExecException } from "child_process";
import { Uri } from "vscode";
import { OBITools } from "./OBITools";

export class DirTool {

  public static list_dir(dir: string): string[] {
    const fs = require('fs');

    const files = fs.readdirSync(dir);

    return files;
  }


  public static file_exists(path: string): boolean {
    const fs = require('fs');
    
    if (!fs.existsSync(path))
      return false;

    if (fs.lstatSync(path).isDirectory())
      return false;

    return true;
  }



  public static dir_exists(path: string): boolean {
    const fs = require('fs');
    
    if (!fs.existsSync(path))
      return false;

    if (fs.lstatSync(path).isDirectory())
      return true;

    return false;
  }


  public static is_file(path: string): boolean {
    const fs = require('fs');
    const stats = fs.statSync(path);
    return stats.isFile()
  }


  public static get_json(path: string) {
    const fs = require("fs"); 
    
    let json_string = fs.readFileSync(path);
    // Converting to JSON 
    return JSON.parse(json_string);
  }

  
  public static get_file_changed_date(file: string) {
    const fs = require('fs')
    const { mtime, ctime } = fs.statSync(file);
    return mtime;
  }


  public static get_encoded_file_URI(workspaceUri: Uri, file: string) : string {

    const fileUri = {
      scheme: 'file',
      path: `${workspaceUri.path}/${file}`,
      authority: ''
    };
    return encodeURIComponent(JSON.stringify(fileUri))
  }


  public static get_encoded_source_URI(workspaceUri: Uri, file: string) : string {

    const config = OBITools.get_obi_app_config();

    const fileUri = {
      scheme: 'file',
      path: `${workspaceUri.path}/${config['app_config']['general']['source-dir']}/${file}`,
      authority: ''
    };
    return encodeURIComponent(JSON.stringify(fileUri))
  }



  public static get_encoded_build_output_URI(workspaceUri: Uri, file: string) : string {

    const config = OBITools.get_obi_app_config();

    const fileUri = {
      scheme: 'file',
      path: `${workspaceUri.path}/${config['app_config']['general']['build-output-dir']}/${file}`,
      authority: ''
    };
    return encodeURIComponent(JSON.stringify(fileUri))
  }



  public static get_toml(file: string): any|undefined {

    const fs = require('fs');
    const toml = require('toml');
    try{
      // Read the TOML file into a string
      const data = fs.readFileSync(file, 'utf8');

      // Parse the TOML data into a javascript object
      const result = toml.parse(data);
      return result;
    }
    catch (e: any) {
      console.error(`Error in toml file: ${file}`);
      console.error(`Parsing toml content on line ${e.line}, column ${e.column}: ${e.message}`);
    }
    return undefined;
  }



  public static get_key_value_file(file: string): {}|undefined {

    const fs = require('fs');
    let key_values = {};
    try{
      // Read the TOML file into a string
      const data = fs.readFileSync(file, 'utf8');

      const content_list:[] = data.toString().split('\n');

      for (var i=0; i < content_list.length; i++) {
        
        const line = content_list[i].split('#');

        if (line[0].length == 0)
          continue;

        const k_v: [] = line[0].split('=');
        key_values[k_v[0]] = k_v[1];
      }

      return key_values;
    }
    catch (e: any) {
      console.error(`Error in toml file: ${file}`);
      console.error(`Parsing toml content on line ${e.line}, column ${e.column}: ${e.message}`);
    }
    return undefined;
  }

}