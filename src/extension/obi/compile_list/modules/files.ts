import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { DirTool } from '../../../utilities/DirTool';

export function getFiles(
  dirPath: string,
  fileExtensions: string[] = [],
  fsEncoding: BufferEncoding = 'utf-8'
): Record<string, string> {
  const src: Record<string, string> = {};
  const expandedPath = path.resolve(dirPath);

  function walk(currentPath: string) {
    const files = fs.readdirSync(currentPath);
    for (const file of files) {
      const filePath = path.join(currentPath, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        walk(filePath);
      } else if (fileExtensions.length === 0 || fileExtensions.some(ext => file.endsWith(ext))) {
        const relativePath = path.relative(expandedPath, filePath).replace(/\\/g, '/');
        const hash = getFileHash(filePath);
        src[relativePath] = hash;
      }
    }
  }

  walk(expandedPath);
  return src;
}

export function getChangedSources(
  sourceDir: string,
  buildJsonPath: string,
  objectTypes: string[],
  srcList?: Record<string, string>
): { 'new-objects': string[]; 'changed-sources': string[] } {

  if (!srcList) {
    srcList = getFiles(sourceDir, objectTypes);
  }

  const buildList = DirTool.get_json(buildJsonPath) || {};

  const missingObj: string[] = [];
  const changedSrc: string[] = [];

  for (const src in srcList) {
    if (!buildList.hasOwnProperty(src) || buildList[src] === null || srcList[src] !== buildList[src]) {
      if (!buildList.hasOwnProperty(src)) {
        missingObj.push(src);
      } else {
        changedSrc.push(src);
      }
    }
  }

  return { 'new-objects': missingObj, 'changed-sources': changedSrc };
}

export function getFileHash(filename: string): string {
  if (fs.statSync(filename).size === 0) {
    return '';
  }
  const h = crypto.createHash('md5');
  const fileContent = fs.readFileSync(filename);
  h.update(fileContent);
  return h.digest('hex');
}
