'use strict';

import { Uri } from "vscode";
import { AppConfig } from "../webview/controller/AppConfig";
import path from "path";
import * as source from "../obi/Source";
import * as fs from 'fs';


export class DirTool {


  public static *get_all_files_in_dir(rootdir:string, dir: string, file_extensions: string[]): Generator<string> | undefined {
    
    if (!DirTool.dir_exists(path.join(rootdir, dir)))
      return undefined;
    
    const fs = require('fs');
    const files = fs.readdirSync(path.join(rootdir, dir), { withFileTypes: true });

    for (const file of files) {
      if (file.isDirectory()) {
        yield* DirTool.get_all_files_in_dir(rootdir, path.join(dir, file.name), file_extensions);
      } else {
        if (file_extensions.includes(file.name.split('.').pop()))
          yield path.join(dir, file.name);
      }
    }
  }


  public static list_dir(dir: string): string[] {
    const files = fs.readdirSync(dir);

    return files;
  }


  public static file_exists(path: string): boolean {
    
    if (!fs.existsSync(path))
      return false;

    if (fs.lstatSync(path).isDirectory())
      return false;

    return true;
  }



  public static dir_exists(path: string): boolean {
    
    if (!fs.existsSync(path))
      return false;

    if (fs.lstatSync(path).isDirectory())
      return true;

    return false;
  }


  public static is_file(path: string): boolean {
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

    const config = AppConfig.get_app_confg();

    const fileUri = {
      scheme: 'file',
      path: `${workspaceUri.path}/${config.general.source_dir}/${file}`,
      authority: ''
    };
    return encodeURIComponent(JSON.stringify(fileUri))
  }



  public static get_encoded_build_output_URI(workspaceUri: Uri, file: string) : string {

    const config = AppConfig.get_app_confg();

    const fileUri = {
      scheme: 'file',
      path: `${workspaceUri.path}/${config.general.build_output_dir}/${file}`,
      authority: ''
    };
    return encodeURIComponent(JSON.stringify(fileUri))
  }



  public static get_toml(file: string): any|undefined {

    if (!DirTool.file_exists(file)) {
      console.warn(`File does not exist: ${file}`);
      return undefined
    }

    const toml = require('smol-toml');
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


  public static write_toml(file: string, data: {}): any|undefined {

    const toml = require('smol-toml');
    try{
      
      // Read the TOML file into a string
      const text = toml.stringify(data);

      fs.writeFileSync(file, text, 'utf8');
    }
    catch (e: any) {
      console.error(`Error in toml file: ${file}`);
      console.error(`Parsing toml content on line ${e.line}, column ${e.column}: ${e.message}`);
    }
    return;
  }



  public static write_file(file: string, content: string): void {

    try{
      
      fs.writeFileSync(file, content, 'utf8');
    }
    catch (e: any) {
      console.error(`Error in toml file: ${file}`);
      console.error(`Parsing toml content on line ${e.line}, column ${e.column}: ${e.message}`);
    }
    return;
  }



  public static get_key_value_file(file: string): string[]|undefined {

    let key_values: {}= {};
    if (!DirTool.file_exists(file))
      return undefined;
    
    try{
      // Read the TOML file into a string
      const data = fs.readFileSync(file, 'utf8');

      return data.toString().split('\n');
    }
    catch (e: any) {
      console.error(`Error in toml file: ${file}`);
      console.error(`Parsing toml content on line ${e.line}, column ${e.column}: ${e.message}`);
    }
    return undefined;
  }



  public static clean_dir(file: string): void {

    fs.rmSync(file, { recursive: true, force: true });
    fs.mkdirSync(file);
  }


  public static get_shell_config(file: string): {}|undefined {

    const content_list: string[]|undefined = DirTool.get_key_value_file(file);
    if (!content_list)
      return undefined;

    let key_values: {} = {};

    for (var i=0; i < content_list.length; i++) {
      
      const line = content_list[i].trim().split('#');
      if (line[0].length == 0)
        continue;

      const line2 = content_list[i].trim().split('source ');
      if (line2[0].length == 0)
        continue;

      const k_v: string[] = line[0].trim().split('=');
      key_values[k_v[0]] = k_v[1];
    }

    return key_values;

  }


/*
  public static async get_hash_file(file:string): Promise<string> {
 
    const hasha = require('hasha');

    // Get the MD5 hash of an image
    const fileHash = await hasha.fromFile(file, {algorithm: 'md5'});
    
    return fileHash;
  }


      var fs = require('fs')
    var crypto = require('crypto')
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(path);
      stream.on('error', err => reject(err));
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
    */

  public static checksumFile(root: string, file_path: string) {
    var crypto = require('crypto')
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(path.join(root, file_path));
      stream.on('error', err => reject(err));
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => {
        resolve({[file_path] : {hash: String(hash.digest('hex'))}});
      });
    });
  }
}