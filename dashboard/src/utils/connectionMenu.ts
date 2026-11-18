const listeners = new Set<() => void>();

/** Windows and Linux draw the File menu in the page, so the click stays here. */
export function requestConnectionMenu(): void {
  for (const listener of listeners) listener();
}

export function onConnectionMenu(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
