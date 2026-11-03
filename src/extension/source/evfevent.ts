// Compile messages from EVFEVENT files (IBM i compiler events) and their files in the workspace.
// No vscode imports: this module is unit-tested in plain Node.

import * as path from 'path';
import { ErrorInformationRecord, IMarkerCreator, ISequentialFileReader, Parser } from '@ibm/ibmi-eventf-parser';


export interface CompileMessage {
  /** File the message belongs to, as the compiler saw it (IFS path, QSYS member, …) */
  location: string;
  /** 1-based; 0 if the message has no position (e.g. "Compilation stopped") */
  start_line: number;
  end_line: number;
  /** 1-based columns; 0 = whole line */
  token_start: number;
  token_end: number;
  msgid: string;
  severity: number;
  text: string;
}


class LineReader implements ISequentialFileReader {
  private index = 0;
  constructor(private readonly lines: string[]) { }

  readNextLine(): string | undefined {
    return this.index < this.lines.length ? this.lines[this.index++] : undefined;
  }
}


class Collector implements IMarkerCreator {
  public readonly messages: CompileMessage[] = [];

  createMarker(record: ErrorInformationRecord, fileLocation: string): void {
    this.messages.push({
      location: fileLocation,
      start_line: record.getStartErrLine(),
      end_line: record.getEndErrLine(),
      token_start: record.getTokenStart(),
      token_end: record.getTokenEnd(),
      msgid: record.getMsgId(),
      severity: record.getSevNum(),
      text: record.getMsg(),
    });
  }
}


/** Messages of an EVFEVENT file; the parser maps lines of copybooks and precompiler expansions to their files */
export function parse_evfevent(content: string): CompileMessage[] {
  // CPYTOIMPF writes fixed-length records; trailing blanks would end up in the file names
  const lines = content.split(/\r?\n/).map(line => line.trimEnd()).filter(line => line.length > 0);
  const collector = new Collector();
  new Parser().parse(new LineReader(lines), collector);
  return collector.messages;
}


/**
 * Workspace file of a compiler file location: the longest suffix of the location (at least lib/member)
 * that exists below `source_root`, e.g. "/home/MAX/proj/src/lib/qrpglesrc/a.rpgle.pgm" → "<source_root>/lib/qrpglesrc/a.rpgle.pgm".
 * Undefined for files outside the project (QSYS members, system includes).
 */
export function map_location(location: string, source_root: string, exists: (file: string) => boolean, p: typeof path = path): string | undefined {
  const parts = location.split(/[\\/]+/).filter(part => part.length > 0 && part !== '.');
  for (let i = 0; i <= parts.length - 2; i++) {
    const candidate = p.join(source_root, ...parts.slice(i));
    if (exists(candidate))
      return candidate;
  }
  return undefined;
}
