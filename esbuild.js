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


const source_config_ViewConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/webview/controller/javascript/source_config.ts"],
  outfile: "./out/source_config.js",
};


const source_dependency_ViewConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/webview/source_list/javascript/source_dependency.ts"],
  outfile: "./out/source_dependency.js",
};


const sourceListConfigViewConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/webview/source_list/javascript/source_list_config.ts"],
  outfile: "./out/source_list_config.js",
};

const sourceInfosViewConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/webview/source_list/javascript/source_infos.ts"],
  outfile: "./out/source_infos.js",
};

const i_releaser_ViewConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/webview/deployment/javascript/i_releaser.ts"],
  outfile: "./out/i_releaser.js",
};

const deployment_config_ViewConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  entryPoints: ["./src/webview/deployment/javascript/deployment_config.ts"],
  outfile: "./out/deployment_config.js",
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
    await build(sourceInfosViewConfig);
    await build(source_config_ViewConfig);
    await build(source_dependency_ViewConfig);
    await build(i_releaser_ViewConfig);
    await build(deployment_config_ViewConfig);
    console.log("build complete");
  } catch (err) {
    process.stderr.write(err.stderr);
    process.exit(1);
  }
})();