
export interface SourceItem {
  hash: string,
  created: Date
}


export interface Source {
  [source: string]: SourceItem
}

export interface ChangedSources {
  "new-objects": Source[],
  "changed-sources": Source[]
}