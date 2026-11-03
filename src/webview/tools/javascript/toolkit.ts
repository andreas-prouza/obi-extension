import { allComponents, provideVSCodeDesignSystem } from "@vscode/webview-ui-toolkit";

// All components of the toolkit, for the whole page. Every page script imports this first.
provideVSCodeDesignSystem().register(allComponents);
