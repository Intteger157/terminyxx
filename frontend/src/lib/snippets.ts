import { SSHWriteInput } from '../../wailsjs/go/main/App';
import { inputTargets } from './broadcast';

export interface Snippet {
  id: string;
  name: string;
  command: string;
  description: string;
  group: string;
  execute: boolean;
  sortOrder: number;
}

export interface SnippetVar {
  name: string;
  default: string;
}

const VAR = /\{\{\s*([A-Za-z_][\w.-]*)\s*(?::([^}]*))?\}\}/g;

/** Variables in a command, in order of first appearance. */
export function snippetVars(command: string): SnippetVar[] {
  const seen = new Map<string, SnippetVar>();
  for (const m of command.matchAll(VAR)) {
    if (!seen.has(m[1])) seen.set(m[1], { name: m[1], default: m[2] ?? '' });
  }
  return [...seen.values()];
}

export function fillSnippet(command: string, values: Record<string, string>): string {
  return command.replace(VAR, (_all, name: string, def?: string) => values[name] ?? def ?? '');
}

/**
 * Types the snippet into a pane. Lines are separated by Enter; with `execute`
 * the last line is submitted too. `broadcast` sends to every pane that
 * currently receives the typed input of `paneId`.
 */
export async function sendSnippet(paneId: string, text: string, execute: boolean, broadcast = false) {
  const body = text.replace(/\r\n|\n/g, '\r').replace(/\r+$/, '');
  const data = execute ? body + '\r' : body;
  const targets = broadcast ? inputTargets(paneId) : [paneId];
  await Promise.all(targets.map((id) => SSHWriteInput(id, data).catch(() => {})));
}
