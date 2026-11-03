// file: esbuild.js

const fs = require("fs");
const path = require("path");
const { context } = require("esbuild");

// Check if the --watch flag was passed in the CLI
const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production") || process.env.NODE_ENV === "production";

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
  target: "node20",   // Node of VS Code 1.90 (engines.vscode)
  entryPoints: ["./src/extension.ts"],
  outfile: "./out/extension.js",
  // ssh2 is bundled; its optional native parts are loaded in try/catch and fall back to JavaScript
  external: ["vscode", "cpu-features", "*.node"],
};

// Every script in a javascript folder is the script of a page; tools/javascript has what they share.
function webview_entries() {
  const entries = {};
  for (const file of fs.readdirSync("src/webview", { recursive: true })) {
    const name = file.replace(/\\/g, "/");
    if (/\/javascript\/[^/]+\.ts$/.test(name) && !name.startsWith("tools/"))
      entries[path.basename(name, ".ts")] = `./src/webview/${name}`;
  }
  return entries;
}

// Page scripts in out/webview; code they share (the UI toolkit) in chunks, loaded once per page
const webviewConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  splitting: true,
  entryPoints: webview_entries(),
  outdir: "./out/webview",
  chunkNames: "chunks/[name]-[hash]",
};

const configs = [extensionConfig, webviewConfig];

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