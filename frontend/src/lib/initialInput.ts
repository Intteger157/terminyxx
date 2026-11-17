// Text to type into a session as soon as its shell is running (once).

const pending = new Map<string, string>();

export function setInitialInput(id: string, text: string) {
  pending.set(id, text);
}

export function takeInitialInput(id: string): string | undefined {
  const t = pending.get(id);
  pending.delete(id);
  return t;
}
