'use strict';

import * as vscode from 'vscode';
import { Uri } from "vscode";
import { AppConfig } from "../webview/controller/AppConfig";
import path from "path";
import * as source from "../obi/Source";
import * as fs from 'fs';
import { Workspace } from "./Workspace";


const crypto = require('crypto')


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


  /**
   * List files in a directory recursive
   * It's async for better performance
   * @param rootdir 
   * @param dir 
   * @param file_extensions 
   * @returns 
   */
  public static async get_all_files_in_dir2(rootdir:string, dir: string, file_extensions: string[]): Promise<string[] | undefined> {
    
    if (!DirTool.dir_exists(path.join(rootdir, dir)))
      return undefined;
    
    let file_list: string[] = [];
    let call_list = [];

    const fs = require('fs');
    const files = fs.readdirSync(path.join(rootdir, dir), { withFileTypes: true });


    for (const file of files) {
      if (file.isDirectory()) {
        call_list.push(DirTool.get_all_files_in_dir2(rootdir, path.join(dir, file.name), file_extensions));
      } else {
        if (file_extensions.includes(file.name.split('.').pop()))
          file_list.push(path.join(dir, file.name));
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
  public static async get_all_files_in_dir3(rootdir:string, dir: string, file_extensions: string[]): Promise<source.IQualifiedSource[] | undefined> {
    
    if (!DirTool.dir_exists(path.join(rootdir, dir)))
      return undefined;
    
    let file_list: source.IQualifiedSource[] = [];
    let call_list = [];

    const fs = require('fs');
    const files = fs.readdirSync(path.join(rootdir, dir), { withFileTypes: true });


    for (const file of files) {
      if (file.isDirectory()) {
        call_list.push(DirTool.get_all_files_in_dir3(rootdir, path.join(dir, file.name), file_extensions));
      } else {
        if (file_extensions.includes(file.name.split('.').pop())) {
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


  public static get_json(path: string): any|undefined {

    if (!DirTool.file_exists(path)) {
      console.warn(`File does not exist: ${path}`);
      return undefined
    }

    const fs = require("fs"); 
    
    let json_string = fs.readFileSync(path);
    // Converting to JSON 
    return JSON.parse(json_string);
  }

  
  public static get_file_changed_date(file: string) {
    const { mtime, ctime } = fs.statSync(file);
    return mtime;
  }


  public static get_file_URI(file: string) : {} {

    let scheme:string = 'file';
    let remote_ws_host:string = '';

    if (vscode.env.remoteName) {
      scheme = 'vscode-remote';
      remote_ws_host = AppConfig.get_app_confg().general['cloud-ws-ssh-remote-host'] || vscode.env.remoteName;
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

    const config = AppConfig.get_app_confg();

    return DirTool.get_encoded_file_URI(path.join(config.general["source-dir"], file))
  }



  public static get_encoded_build_output_URI(file: string) : string {

    const config = AppConfig.get_app_confg();

    return DirTool.get_encoded_file_URI(path.join(config.general["build-output-dir"], file))

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

    console.log(`Write data to ${file}`);
    
    try{
      if (!DirTool.dir_exists(path.dirname(file)))
        fs.mkdirSync(path.dirname(file), {recursive: true});

      fs.writeFileSync(file, content, 'utf8');
    }
    catch (e: any) {
      console.error(`Error write file: ${file}: ${e.message}`);
      if (e.line)
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



  public static get_file_content(file: string): string|undefined {

    if (!DirTool.file_exists(file))
      return undefined;
    
    try{
      // Read the TOML file into a string
      const data = fs.readFileSync(file, 'utf8');
      return data.toString();
    }
    catch (e: any) {
      console.error(`Error on reading ${file}`);
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