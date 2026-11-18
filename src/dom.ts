/** Resolve required markup and verify its element type before using its API. */
export function element<T extends HTMLElement>(id: string, constructor: { new (): T }): T {
  const node = document.getElementById(id);
  if (!(node instanceof constructor)) throw new Error(`Missing or invalid #${id}`);
  return node;
}

export const html = (id: string): HTMLElement => element(id, HTMLElement);
