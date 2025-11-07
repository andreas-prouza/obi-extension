

export interface IQualifiedSource {
  "source-lib": string,
  "source-file": string,
  "source-member": string,
  "use-regex": boolean,
  "show-empty-folders": boolean,
  path?: string,
  description?: String
}

export interface ISourceInfo {
  description: String
}

export interface ISourceInfos {
  [key: string]: ISourceInfo
}



export interface ISource {
  [source: string]: string
}

export interface IChangedSources {
  "new-objects": ISource[],
  "changed-sources": ISource[]
}

export interface ISourceList {
  "new-objects": string[],
  "changed-sources": string[],
  "dependencies"?: string[],
  "old-sources"?: string[]
}


export type SourceCmd = {
  "cmd": string,
  "status": string,
  "updated": string,
  "exit-code": number,
  "stdout": string,
  "stderr": string,
  "joblog": string,
}


export type SourceCompileList = {
  "source": string,
  "cmds": SourceCmd[],
  "hash": string,
  "status": string
}