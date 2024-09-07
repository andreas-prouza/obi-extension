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
  entryPoints: ["./src/webview/show_changes/javascript/show_changes.ts"],
  outfile: "./out/show_changes.js",
};

const controllerViewConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/webview/controller/javascript/controller.ts"],
  outfile: "./out/controller.js",
};

const welcomeViewConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/webview/controller/javascript/welcome.ts"],
  outfile: "./out/welcome.js",
};

const configViewConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/webview/controller/javascript/config.ts"],
  outfile: "./out/config.js",
};

const configInvalidViewConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/webview/controller/javascript/config_invalid.ts"],
  outfile: "./out/config_invalid.js",
};


const sourceListConfigViewConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/webview/controller/javascript/source_list_config.ts"],
  outfile: "./out/source_list_config.js",
};

(async () => {
  try {
    await build(extensionConfig);
    await build(webviewConfig);
    await build(buildSummaryViewConfig);
    await build(controllerViewConfig);
    await build(welcomeViewConfig);
    await build(configViewConfig);
    await build(configInvalidViewConfig);
    await build(sourceListConfigViewConfig);
    console.log("build complete");
  } catch (err) {
    process.stderr.write(err.stderr);
    process.exit(1);
  }
})();