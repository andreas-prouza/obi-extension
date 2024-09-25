

export interface IQualifiedSource {
  "source-lib": string,
  "source-file": string,
  "source-member": string,
  path?: string,
  description?: string
}

export interface ISourceInfo {
  description: string
}

export interface ISourceInfos {
  [key: string] : ISourceInfo
}


export interface ISourceItem {
  hash: string,
  created: Date
}


export interface ISource {
  [source: string]: ISourceItem
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