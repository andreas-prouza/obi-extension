import * as vscode from 'vscode';
import * as winston from "winston";
import Transport, {TransportStreamOptions} from 'winston-transport';
import { Workspace } from './Workspace';
import path from 'path';


const outputChannel = vscode.window.createOutputChannel(`OBI`);

let ws: string = '';
if (vscode.workspace.workspaceFolders)
  ws = vscode.workspace.workspaceFolders[0].uri.fsPath

//const winston = require('winston');

class CustomTransport extends Transport {
  constructor(opts: TransportStreamOptions) {
    super(opts);
  }
  log(info: winston.LogEntry, callback: any) {
    setImmediate(() => {
      this.emit("logged", info);
    });

    const { level, message, ...meta } = info;
    // do whatever you want with log data
    outputChannel.appendLine(`${new Date().toISOString()} - ${level} - ${message}`);
    callback();
  }
};


const myCustomTransport = new CustomTransport({});

export const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.align(),
    winston.format.printf((info) => `[${info.timestamp}] ${info.level}: ${info.message}`)
  ),
  //defaultMeta: { service: 'user-service' },
  transports: [
    //
    // - Write all logs with importance level of `error` or less to `error.log`
    // - Write all logs with importance level of `info` or less to `combined.log`
    //
    new winston.transports.File({ dirname: path.join(ws, '.obi', 'log'), filename: 'error.log', level: 'error' }),
    new winston.transports.File({ dirname: path.join(ws, '.obi', 'log'), filename: 'combined.log' }),
    new winston.transports.Console(),
    myCustomTransport
  ],
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
//logger.add(new winston.transports.Console({
//  format: winston.format.simple(),
//}));
