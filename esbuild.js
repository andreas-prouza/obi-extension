// file: esbuild.js

const { context } = require("esbuild");

// Check if the --watch flag was passed in the CLI
const watch = process.argv.includes("--watch");
const production = process.env.NODE_ENV === "production";

const baseConfig = {
  bundle: true,
  minify: production,
  sourcemap: !production,
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

// Group all configurations into an array
const configs = [
  extensionConfig,
  webviewConfig,
  buildSummaryViewConfig,
  controllerViewConfig,
  welcomeViewConfig,
  configViewConfig,
  configInvalidViewConfig,
  sourceListConfigViewConfig,
  sourceInfosViewConfig,
  source_config_ViewConfig,
  source_dependency_ViewConfig,
  i_releaser_ViewConfig,
  deployment_config_ViewConfig,
];

(async () => {
  try {
    // Create an esbuild context for every configuration
    const contexts = await Promise.all(configs.map((c) => context(c)));

    if (watch) {
      // If the --watch flag is present, start watching all contexts
      await Promise.all(contexts.map((ctx) => ctx.watch()));
      console.log("Watching for changes...");
    } else {
      // Otherwise, build once and dispose of the contexts
      await Promise.all(contexts.map((ctx) => ctx.rebuild()));
      await Promise.all(contexts.map((ctx) => ctx.dispose()));
      console.log("Build complete");
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();