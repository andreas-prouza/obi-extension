interface SourceInfo {
  description: string;
}

interface SourceFiles {
  [key: string]: SourceInfo;
}

const sourceFiles: SourceFiles = {
  "prouzalib/qcllesrc/testcl.clle.pgm": {
    "description": "Test CL PGM"
  },
  "prouzalib/qddssrc/file1.pf.file": {
    "description": "Test PF file"
  }
};

console.log(sourceFiles);

const filteredFiles: SourceFiles = Object.fromEntries(
  Object.entries(sourceFiles).filter(([, value]) =>
    value.description.toLowerCase().includes("test")
  )
);

console.log("Filtered files:", filteredFiles);
