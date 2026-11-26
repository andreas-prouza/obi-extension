import { allComponents, provideVSCodeDesignSystem } from "@vscode/webview-ui-toolkit";

// Components of the deprecated webview toolkit (<vscode-button>, …) for custom build summary templates.
// The build summary loads this script only if the custom template uses them (BuildSummary.custom_template).
provideVSCodeDesignSystem().register(allComponents);
