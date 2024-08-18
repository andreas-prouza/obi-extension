
export interface SourceItem {
  hash: string,
  created: Date
}


export interface Source {
  [source: string]: SourceItem
}

