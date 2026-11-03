import * as vscode from 'vscode';
import * as winston from "winston";
import TransportStream, { TransportStreamOptions } from 'winston-transport';
import * as path from 'path';
import { redact } from '../../shared/Redact';
import { ExtensionSettings } from './ExtensionSettings';


// Created on activation (register_output_channel), not on import. Without it (tests, before activation),
// log lines go to the console.
let outputChannel: vscode.LogOutputChannel | undefined = undefined;

/** Values to mask in every log line (secret* variables of the config), set on activation */
let secrets: () => string[] = () => [];


/** Writes to the "OBI" log channel; its level is shown by VS Code */
class ChannelTransport extends TransportStream {
  constructor(opts: TransportStreamOptions) {
    super(opts);
  }
  log(info: winston.LogEntry, callback: () => void) {
    setImmediate(() => {
      this.emit("logged", info);
    });

    const channel = outputChannel;
    const message = String(info.message).replace(/^\t/, '');   // format.align; the channel adds its own prefix
    if (channel) {
      switch (info.level) {
        case 'error': channel.error(message); break;
        case 'warn': channel.warn(message); break;
        case 'info': channel.info(message); break;
        case 'silly': channel.trace(message); break;
        default: channel.debug(message); break;   // http, verbose, debug
      }
    }
    else
      console.log(`${new Date().toISOString()} ${info.level}: ${message}`);
    callback();
  }
};


/** VS Code log level → winston level */
function winston_level(level: vscode.LogLevel): string {
  switch (level) {
    case vscode.LogLevel.Trace: return 'silly';
    case vscode.LogLevel.Debug: return 'debug';
    case vscode.LogLevel.Warning: return 'warn';
    case vscode.LogLevel.Error: return 'error';
    case vscode.LogLevel.Off: return 'error';
    default: return 'info';
  }
}


/** Shows the "OBI" output channel (action "Show log" of error messages) */
export function show_log(): void {
  outputChannel?.show(true);
}


/**
 * Creates the "OBI" log channel (on activation) and disposes it with the extension. The level follows
 * Developer: Set Log Level… → OBI (default: info).
 */
export function register_output_channel(context: vscode.ExtensionContext): void {
  const channel = outputChannel ?? vscode.window.createOutputChannel('OBI', { log: true });
  outputChannel = channel;
  logger.level = winston_level(channel.logLevel);
  context.subscriptions.push(
    channel.onDidChangeLogLevel(level => { logger.level = winston_level(level); }),
    {
      dispose: () => {
        channel.dispose();
        outputChannel = undefined;
      }
    }
  );
}


/** Masks the returned values (secret* variables) in every log line */
export function set_secret_values(provider: () => string[]): void {
  secrets = provider;
  cached_secrets = undefined;
}


/**
 * Log files in <workspace>/.obi/log (settings obi.log.writeFiles, obi.log.maxFileSizeMB): at most
 * maxFileSizeMB per file, 3 files each (combined.log, combined1.log, …).
 */
export function add_log_files(workspace: string): void {
  if (!ExtensionSettings.log_write_files())
    return;

  const maxsize = ExtensionSettings.log_max_file_size_mb() * 1024 * 1024;
  const dirname = path.join(workspace, '.obi', 'log');
  logger.add(new winston.transports.File({ dirname, filename: 'error.log', level: 'error', maxsize, maxFiles: 3, tailable: true }));
  logger.add(new winston.transports.File({ dirname, filename: 'combined.log', maxsize, maxFiles: 3, tailable: true }));
}


const SECRETS_REFRESH_MS = 5000;
let cached_secrets: { at: number; values: string[] } | undefined = undefined;
let reading_secrets = false;

/** The secret values, read again at most every few seconds (reading the config logs as well: no recursion) */
function current_secrets(): string[] {
  if (cached_secrets && Date.now() - cached_secrets.at < SECRETS_REFRESH_MS)
    return cached_secrets.values;
  if (reading_secrets)
    return cached_secrets?.values ?? [];

  reading_secrets = true;
  try {
    cached_secrets = { at: Date.now(), values: secrets() };
  }
  catch {
    cached_secrets = { at: Date.now(), values: [] };   // no valid config yet: nothing to mask
  }
  finally {
    reading_secrets = false;
  }
  return cached_secrets.values;
}

const mask_secrets = winston.format(info => {
  const values = current_secrets();
  if (values.length > 0)
    info.message = redact(String(info.message), values);
  return info;
});


export const logger = winston.createLogger({
  // Tests: OBI_LOG_LEVEL=debug npm test
  level: process.env.OBI_LOG_LEVEL || 'info',
  format: winston.format.combine(
    mask_secrets(),
    winston.format.timestamp(),
    winston.format.align(),
    winston.format.printf((info) => `[${info.timestamp}] ${info.level}: ${info.message}`)
  ),
  transports: [new ChannelTransport({})],
});
