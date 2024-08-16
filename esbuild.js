// file: esbuild.js

const { build } = require("esbuild");


const baseConfig = {
  bundle: true,
  minify: process.env.NODE_ENV === "production",
  sourcemap: process.env.NODE_ENV !== "production",
};

const extensionConfig = {
  ...baseConfig,
  platform: "node",
  mainFields: ["module", "main"],
  format: "cjs",
  entryPoints: ["./src/extension.ts"],
  outfile: "./out/extension.js",
  external: ["vscode", "cpu-features", "ssh2"],
};

const webviewConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/webview/main.ts"],
  outfile: "./out/webview.js",
};

const buildSummaryViewConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/webview/show_changes/main.ts"],
  outfile: "./out/show_changes.js",
};

const controllerViewConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/webview/controller/javascript/controller.ts"],
  outfile: "./out/controller.js",
};

const configViewConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/webview/controller/javascript/config.ts"],
  outfile: "./out/config.js",
};


(async () => {
  try {
    await build(extensionConfig);
    await build(webviewConfig);
    await build(buildSummaryViewConfig);
    await build(controllerViewConfig);
    await build(configViewConfig);
    console.log("build complete");
  } catch (err) {
    process.stderr.write(err.stderr);
    process.exit(1);
  }
})();