/** Translated text rendered into the page (tools/alertBox.html), or the English fallback */
export function page_text(id: string, fallback: string): string {
  return document.getElementById(id)?.textContent?.trim() || fallback;
}


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

