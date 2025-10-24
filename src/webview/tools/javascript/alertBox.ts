import {
  allComponents,
  provideVSCodeDesignSystem,
  Button,
  TextField
} from "@vscode/webview-ui-toolkit";



// In order to use all the Webview UI Toolkit web components they
// must be registered with the browser (i.e. webview) using the
// syntax below.
provideVSCodeDesignSystem().register(allComponents);


export function showAlert(text: string, type: 'success' | 'info' | 'error' = 'info') {
  const box = document.getElementById('alertBox');
  box.textContent = text;
  box.className = `alert ${type}`;
  box.style.display = 'block';
  console.log(`Show alert: ${type} - ${box.className}`);
  setTimeout(() => box.style.display = 'none', 2000);
}

