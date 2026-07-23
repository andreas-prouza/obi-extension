import {
  allComponents,
  provideVSCodeDesignSystem
} from "@vscode/webview-ui-toolkit";



// In order to use all the Webview UI Toolkit web components they
// must be registered with the browser (i.e. webview) using the
// syntax below.
provideVSCodeDesignSystem().register(allComponents);


export function showAlert(text: string, type: 'success' | 'info' | 'error' = 'info') {
  const box = document.getElementById('alertBox');
  if (!box) {
    console.error('Alert box element not found');
    return;
  }

  const timeout = {
    'success': 2000,
    'info': 2000,
    'error': 5000
  }

  box.textContent = text;
  box.className = `alert ${type}`;
  box.style.display = 'block';
  setTimeout(() => box.style.display = 'none', timeout[type]);
}

