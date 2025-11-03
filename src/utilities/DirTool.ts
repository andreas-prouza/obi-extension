'use strict';

import * as vscode from 'vscode';
import { Uri } from "vscode";
import { logger } from './Logger';
import { AppConfig } from "../webview/controller/AppConfig";

import * as path from 'path';
import * as source from "../obi/Source";
import * as fs from 'fs';
import { Workspace } from "./Workspace";


const crypto = require('crypto')


export class DirTool {



  public static resolve_env_in_path(path: string): string {
    const envPatternUnix = /\$(\w+)/g;
    const envPatternWindows = /%(\w+)%/g;

    path = path.replace(envPatternUnix, (_, envVar) => process.env[envVar] || _);
    path = path.replace(envPatternWindows, (_, envVar) => process.env[envVar] || _);

    return path;
  }



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


  /**
   * List files in a directory recursive
   * It's async for better performance
   * @param rootdir 
   * @param dir 
   * @param file_extensions 
   * @returns 
   */
  public static async get_all_files_in_dir2(rootdir:string, dir: string, file_extensions: string[], replace_backslash: boolean = false): Promise<string[] | undefined> {
    
    if (!DirTool.dir_exists(path.join(rootdir, dir)))
      return undefined;
    
    let file_list: string[] = [];
    let call_list = [];

    const fs = require('fs');
    const files = fs.readdirSync(path.join(rootdir, dir), { withFileTypes: true });


    let file_path: string;

    for (const file of files) {

      if (file.isDirectory()) {
        call_list.push(DirTool.get_all_files_in_dir2(rootdir, path.join(dir, file.name), file_extensions, replace_backslash));
      } else {

        if (file_extensions.includes(file.name.split('.').pop())) {

          file_path = path.join(dir, file.name)
          
          if (replace_backslash)
            file_path = file_path.replace(/\\/g, '/');
          file_list.push(file_path);
        }
      }
    }

    const results = await Promise.all(call_list);
    results.map((list: string[]|undefined) => {
      if (list)
        file_list = [...file_list, ...list];
    });

    return file_list;
  }

  

  /**
   * List files in a directory recursive
   * It's async for better performance
   * @param rootdir 
   * @param dir 
   * @param file_extensions 
   * @returns 
   */
  public static async get_all_files_in_dir3(rootdir:string, dir: string, file_extensions: string[]|undefined): Promise<source.IQualifiedSource[] | undefined> {
    
    if (!DirTool.dir_exists(path.join(rootdir, dir)))
      return undefined;
    
    let file_list: source.IQualifiedSource[] = [];
    let call_list = [];

    const fs = require('fs');
    const files = fs.readdirSync(path.join(rootdir, dir), { withFileTypes: true });

    if (files.length == 0) {
      const path_array: string[] = dir.split('/');
      const src_lib = path_array[0] ?? null;
      const src_file = path_array[1] ?? null;
      return [{"source-lib": src_lib, "source-file": src_file, "source-member": ''}];
    }


    for (const file of files) {
      if (file.isDirectory()) {
        call_list.push(DirTool.get_all_files_in_dir3(rootdir, path.join(dir, file.name), file_extensions));
      } else {
        if (file_extensions == undefined || file_extensions.includes(file.name.split('.').pop())) {
          const source: string = path.join(dir, file.name).replaceAll('\\', '/');
          const source_arr: string[] = source.split('/').reverse();
          const src_mbr = source_arr[0];
          const src_file = source_arr[1];
          const src_lib = source_arr[2];
          file_list.push({"source-lib": src_lib, "source-file": src_file, "source-member": src_mbr});
        }
      }
    }

    const results = await Promise.all(call_list);
    results.map((list: source.IQualifiedSource[]|undefined) => {
      if (list)
        file_list = [...file_list, ...list];
    });

    return file_list;
  }


  public static list_dir(dir: string): string[] {

    dir = DirTool.resolve_env_in_path(dir);
    const files = fs.readdirSync(dir);

    return files;
  }




  public static file_exists(path: string): boolean {
            
    path = DirTool.resolve_env_in_path(path);

    if (!fs.existsSync(path))
      return false;

    if (fs.lstatSync(path).isDirectory())
      return false;

    return true;
  }



  public static dir_exists(path: string): boolean {
    
    path = DirTool.resolve_env_in_path(path);
    
    if (!fs.existsSync(path))
      return false;

    if (fs.lstatSync(path).isDirectory())
      return true;

    return false;
  }



  public static is_file(path: string): boolean {
    path = DirTool.resolve_env_in_path(path);
    const stats = fs.statSync(path);
    return stats.isFile()
  }



  public static get_json(path: string): any|undefined {
    
    path = DirTool.resolve_env_in_path(path);
    
    logger.debug(`Read json ${path}`);
    if (!DirTool.file_exists(path)) {
      logger.warn(`File does not exist: ${path}`);
      return undefined
    }

    const fs = require("fs"); 
    
    let json_string = fs.readFileSync(path);
    // Converting to JSON 
    try {
      return JSON.parse(json_string);
    }
    catch (e: any) {
      logger.error(`JSON parse error for ${path}`);
      logger.debug(`JSON content: ${json_string}`);
      logger.error(`Parsing JSON content on line ${e.line}, column ${e.column}: ${e.message}`);
    }
    
  }


  
  public static get_file_changed_date(file: string) {

    file = DirTool.resolve_env_in_path(file);

    const { mtime, ctime } = fs.statSync(file);
    return mtime;
  }




  public static write_json(file: string, data: {}): any|undefined {
    
    file = DirTool.resolve_env_in_path(file);
    
    try{
      
      // Read the TOML file into a string
      const text = JSON.stringify(data, null, 2);

      fs.writeFileSync(file, text, 'utf8');
    }
    catch (e: any) {
      logger.error(`Error in json file: ${file}`);
    }
    return;
  }



  public static get_file_URI(file: string) : {} {

    let scheme:string = 'file';
    let remote_ws_host:string = '';

    if (vscode.env.remoteName) {
      scheme = 'vscode-remote';
      remote_ws_host = AppConfig.get_app_config().general['cloud-ws-ssh-remote-host'] || vscode.env.remoteName;
    }

    const fileUri = {
      scheme: scheme,
      path: path.join(Workspace.get_workspace(), file),
      authority: remote_ws_host
    };

    return fileUri;
  }



  public static get_encoded_file_URI(file: string) : string {

    return encodeURIComponent(JSON.stringify(DirTool.get_file_URI(file)));
  }


  public static get_encoded_source_URI(workspaceUri: Uri, file: string) : string {

    const config = AppConfig.get_app_config();

    return DirTool.get_encoded_file_URI(path.join(config.general["source-dir"], file))
  }



  public static get_encoded_build_output_URI(file: string) : string {

    const config = AppConfig.get_app_config();

    return DirTool.get_encoded_file_URI(path.join(config.general["build-output-dir"], file))

  }



  public static get_toml(file: string): any|undefined {

    file = DirTool.resolve_env_in_path(file);

    if (!DirTool.file_exists(file)) {
      logger.warn(`File does not exist: ${file}`);
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
      logger.error(`Error in toml file: ${file}`);
      logger.error(`Parsing toml content on line ${e.line}, column ${e.column}: ${e.message}`);
    }
    return undefined;
  }


  public static write_toml(file: string, data: {}): any|undefined {

    file = DirTool.resolve_env_in_path(file);

    const toml = require('smol-toml');
    try{
      
      // Read the TOML file into a string
      const text = toml.stringify(data);

      fs.writeFileSync(file, text, 'utf8');
    }
    catch (e: any) {
      logger.error(`Error in toml file: ${file}`);
      logger.error(`Parsing toml content on line ${e.line}, column ${e.column}: ${e.message}`);
    }
    return;
  }



  public static write_file(file: string, content: string): void {

    file = DirTool.resolve_env_in_path(file);

    logger.info(`Write data to ${file}`);
    
    try{
      if (!DirTool.dir_exists(path.dirname(file)))
        fs.mkdirSync(path.dirname(file), {recursive: true});

      fs.writeFileSync(file, content, 'utf8');
    }
    catch (e: any) {
      logger.error(`Error write file: ${file}: ${e.message}`);
      if (e.line)
        logger.error(`Parsing toml content on line ${e.line}, column ${e.column}: ${e.message}`);
    }
    return;
  }



  public static get_key_value_file(file: string): string[]|undefined {

    file = DirTool.resolve_env_in_path(file);

    let key_values: {}= {};
    if (!DirTool.file_exists(file))
      return undefined;
    
    try{
      // Read the TOML file into a string
      const data = fs.readFileSync(file, 'utf8');

      return data.toString().split('\n');
    }
    catch (e: any) {
      logger.error(`Error in toml file: ${file}`);
      logger.error(`Parsing toml content on line ${e.line}, column ${e.column}: ${e.message}`);
    }
    return undefined;
  }



  public static get_file_content(file: string): string|undefined {

    file = DirTool.resolve_env_in_path(file);

    if (!DirTool.file_exists(file))
      return undefined;
    
    try{
      // Read the TOML file into a string
      const data = fs.readFileSync(file, 'utf8');
      return data.toString();
    }
    catch (e: any) {
      logger.error(`Error on reading ${file}`);
    }
    return undefined;
  }



  public static clean_dir(file: string): void {

    file = DirTool.resolve_env_in_path(file);

    fs.rmSync(file, { recursive: true, force: true });
    fs.mkdirSync(file);
  }


  public static get_shell_config(file: string): {}|undefined {

    file = DirTool.resolve_env_in_path(file);

    const content_list: string[]|undefined = DirTool.get_key_value_file(file);
    if (!content_list)
      return undefined;

    let key_values: {['key']?: string} = {};

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

  public static async checksumFile(root: string, file_path: string): Promise<source.ISource> {

    root = DirTool.resolve_env_in_path(root);
    file_path = DirTool.resolve_env_in_path(file_path);

    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(path.join(root, file_path));
      stream.on('error', err => reject(err));
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => {
        resolve({[file_path] : String(hash.digest('hex'))});
      });
    });
  }
}