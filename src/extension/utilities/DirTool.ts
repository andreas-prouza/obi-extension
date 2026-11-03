'use strict';

import * as vscode from 'vscode';
import { Uri } from "vscode";
import { logger } from './Logger';
import { AppConfig } from "../config/AppConfig";

import * as path from 'path';
import * as fs from 'fs';
import { Workspace } from "./Workspace";
import { ConfigFileError, get_error_message, json_error_position } from "../../shared/Errors";
import { show_error } from "./Notify";
import { local_source_dir, local_source_root, relative_inside } from "./SourcePath";
import { md5_file } from "../obi/compile_list/modules/source_hashes";


const crypto = require('crypto')


export class DirTool {



  public static resolve_env_in_path(path: string): string {
    const envPatternUnix = /\$(\w+)/g;
    const envPatternWindows = /%(\w+)%/g;

    path = path.replace(envPatternUnix, (_, envVar) => process.env[envVar] || _);
    path = path.replace(envPatternWindows, (_, envVar) => process.env[envVar] || _);

    return path;
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
    if (!fs.existsSync(path)) {
        return false;
    }
    return fs.statSync(path).isFile();
  }



  public static get_json(path: string, showErrorMessage: boolean = true): any|undefined {
    
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
    catch (e: unknown) {
      if (showErrorMessage) {
        vscode.window.showErrorMessage(vscode.l10n.t('Error in JSON file {0}: {1}', path, get_error_message(e)));
      }
      // No file content in the log: compile lists can contain secret* variables
      const position = json_error_position(String(json_string), get_error_message(e));
      logger.error(`JSON parse error for ${path} (line ${position.line ?? '?'}, column ${position.column ?? '?'}): ${get_error_message(e)}`);
    }
    return undefined;
    
  }


  


  /**
   * Writes via a temp file + rename, so readers never see a partially written file. Throws on failure.
   */
  public static write_atomic(file: string, content: string): void {

    file = DirTool.resolve_env_in_path(file);
    fs.mkdirSync(path.dirname(file), { recursive: true });

    // Write next to the real file if `file` is a symlink, so the link is kept
    const target = fs.existsSync(file) ? fs.realpathSync(file) : file;
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, content, 'utf8');

    for (let attempt = 0; ; attempt++) {
      try {
        fs.renameSync(tmp, target);
        logger.debug(`Written: ${target}`);
        return;
      }
      catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        // Windows: the target can be locked for a moment (file watcher, virus scanner)
        if (attempt < 3 && (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES')) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
          continue;
        }
        fs.rmSync(tmp, { force: true });
        throw e;
      }
    }
  }



  /**
   * Parsed JSON, or undefined if the file doesn't exist or is empty (older versions created empty files).
   * Throws ConfigFileError if it has content that can't be parsed.
   */
  public static read_json_strict<T>(file: string): T | undefined {

    file = DirTool.resolve_env_in_path(file);
    if (!DirTool.file_exists(file))
      return undefined;

    const text = fs.readFileSync(file, 'utf8');
    if (text.trim().length == 0)
      return undefined;
    try {
      return JSON.parse(text) as T;
    }
    catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const { line, column } = json_error_position(text, message);
      throw new ConfigFileError(file, line, column, message);
    }
  }



  /** Parsed TOML, or undefined if the file doesn't exist. Throws ConfigFileError if it exists but can't be parsed. */
  public static read_toml_strict<T>(file: string): T | undefined {

    file = DirTool.resolve_env_in_path(file);
    if (!DirTool.file_exists(file))
      return undefined;

    const toml = require('smol-toml');
    try {
      return toml.parse(fs.readFileSync(file, 'utf8')) as T;
    }
    catch (e) {
      const error = e as { line?: number; column?: number; message?: string };
      throw new ConfigFileError(file, error.line, error.column, (error.message ?? String(e)).split('\n')[0]);
    }
  }



  /**
   * Writes a config/data file the user may have edited by hand.
   * Refuses to overwrite an existing file that can't be parsed: the data was read from it, so it is incomplete.
   */
  public static update_json(file: string, data: any): void {
    DirTool.read_json_strict(file);   // throws ConfigFileError if the current content is invalid
    DirTool.write_json(file, data);
  }


  /** Like update_json for TOML files. */
  public static update_toml(file: string, data: any): void {
    DirTool.read_toml_strict(file);   // throws ConfigFileError if the current content is invalid
    DirTool.write_toml(file, data);
  }



  /** Shows an error of a failed save; for ConfigFileError with an action to open the file at the error position. */
  public static show_save_error(error: unknown): void {
    if (error instanceof ConfigFileError)
      show_error(vscode.l10n.t('Nothing was saved. Fix the file and try again'), error);
    else
      show_error(vscode.l10n.t('Saving failed'), error);
  }



  /** Writes JSON atomically. Throws on failure. */
  public static write_json(file: string, data: any): void {
    DirTool.write_atomic(file, JSON.stringify(data, null, 2));
  }



  /**
   * URI of a workspace-relative file. Scheme and authority come from the workspace folder,
   * so it works in local, Remote-SSH, WSL, dev container and codespaces windows.
   */
  public static get_file_URI(file: string) : vscode.Uri {

    if (path.isAbsolute(file)) {
      const rel = DirTool.to_workspace_relative(file);
      if (rel === undefined)
        return vscode.Uri.file(file);
      file = rel;
    }

    return vscode.Uri.joinPath(Workspace.get_workspace_uri(), ...file.split(/[\\/]+/).filter(s => s.length > 0 && s !== '.'));
  }



  /** Argument for `command:vscode.open?…` links in webviews */
  public static get_encoded_file_URI(file: string) : string {

    return encodeURIComponent(JSON.stringify(DirTool.get_file_URI(file)));
  }


  /** URI of an OBI source (lib/file/member.ext) for the webviews */
  public static get_encoded_source_URI(source: string) : string {

    return DirTool.get_encoded_file_URI(path.join(DirTool.get_local_source_dir_relative(), source))
  }



  /** Source folder relative to the workspace: <local-base-dir>/<source-dir> */
  public static get_local_source_dir_relative(): string {

    const config = AppConfig.get_app_config();
    return local_source_dir(config.general['local-base-dir'], config.general['source-dir']);
  }



  /** Absolute source folder: <workspace>/<local-base-dir>/<source-dir> */
  public static get_local_source_dir(): string {

    const config = AppConfig.get_app_config();
    return local_source_root(Workspace.get_workspace(), config.general['local-base-dir'], config.general['source-dir']);
  }



  /** OBI source name (lib/file/member.ext) of a local file, or undefined if it's not inside the source folder */
  public static to_obi_source(fs_path: string): string | undefined {

    return relative_inside(DirTool.get_local_source_dir(), fs_path);
  }



  /** Workspace-relative, '/'-separated path of a local file, or undefined if it's not inside the workspace */
  public static to_workspace_relative(fs_path: string): string | undefined {

    return relative_inside(Workspace.get_workspace(), fs_path);
  }



  public static not_in_source_dir_message(fs_path: string): string {

    return vscode.l10n.t('{0} is not inside the OBI source folder {1}', fs_path, DirTool.get_local_source_dir());
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
    catch (e: unknown) {
      const position = e as { line?: number; column?: number };
      logger.error(`Error in toml file: ${file}`);
      logger.error(`Parsing toml content on line ${position.line}, column ${position.column}: ${get_error_message(e)}`);
    }
    return undefined;
  }


  /** Writes TOML atomically. Throws on failure. */
  public static write_toml(file: string, data: any): void {
    const toml = require('smol-toml');
    DirTool.write_atomic(file, toml.stringify(data));
  }



  /** Writes a text file atomically. Throws on failure. */
  public static write_file(file: string, content: string): void {
    DirTool.write_atomic(file, content);
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
    catch (e: unknown) {
      logger.error(`Error on reading ${file}: ${get_error_message(e)}`);
    }
    return undefined;
  }



  public static clean_dir(file: string): void {

    file = DirTool.resolve_env_in_path(file);

    fs.rmSync(file, { recursive: true, force: true });
    fs.mkdirSync(file);
  }


  /** MD5 (hex) of a file */
  public static async get_file_hash(file: string): Promise<string> {
    return md5_file(file);
  }



  public static delete_file(file: string): void {

    if (DirTool.file_exists(file)) {
      fs.unlinkSync(file);
    }
  }

  public static copy_dir(src: string, dest: string): void {
    if (!DirTool.dir_exists(src)) {
      return;
    }
    if (!DirTool.dir_exists(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    let entries = fs.readdirSync(src, { withFileTypes: true });

    for (let entry of entries) {
      let srcPath = path.join(src, entry.name);
      let destPath = path.join(dest, entry.name);

      entry.isDirectory() ? DirTool.copy_dir(srcPath, destPath) : fs.copyFileSync(srcPath, destPath);
    }
  }



  public static copy_file(src: string, dest: string, create: boolean): void {
    if (!DirTool.file_exists(src)) {
      if (create) {
        DirTool.write_file(dest, '');
        return;
      }
      vscode.window.showErrorMessage(vscode.l10n.t('Copy error: source file does not exist: {0}', src));
      throw new Error(`Source file does not exist: ${src}`);
    }
    fs.copyFileSync(src, dest);
  }
}