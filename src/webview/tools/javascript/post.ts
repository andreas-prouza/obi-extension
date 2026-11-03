/** Typed postMessage: only messages of the page's request union compile. The extension validates them again. */
export function typed_post<M>(api: { postMessage(message: unknown): void }): (message: M) => void {
  return (message: M) => api.postMessage(message);
}
