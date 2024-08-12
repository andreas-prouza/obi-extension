
export interface AppConfigDict {
  
  general: {
    "local-base-dir": string,
    "remote-base-dir": string,
    "supported-object-types": string[],
    "file-system-encoding": string,
    "console-output-encoding": string,
    "source-dir": string,
    "compiled-object-list": string,
    "dependency-list": string
  }

}