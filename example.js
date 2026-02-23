"use strict";
const sourceFiles = {
    "prouzalib/qcllesrc/testcl.clle.pgm": {
        "description": "Test CL PGM"
    },
    "prouzalib/qddssrc/file1.pf.file": {
        "description": "Test PF file"
    }
};
console.log(sourceFiles);
const filteredFiles = Object.fromEntries(Object.entries(sourceFiles).filter(([, value]) => value.description.toLowerCase().includes("test")));
console.log("Filtered files:", filteredFiles);
//# sourceMappingURL=example.js.map