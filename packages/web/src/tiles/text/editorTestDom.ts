/**
 * What jsdom lacks and ProseMirror reads when it scrolls the selection into
 * view: a Range's client rects. An empty list and an empty box, as a
 * collapsed range off-screen has, for the editor's tests only.
 */
const range = Range.prototype as unknown as Record<string, unknown>;
if (typeof range['getClientRects'] !== 'function')
  range['getClientRects'] = function getClientRects() {
    return Object.assign([], { item: () => null });
  };
if (typeof range['getBoundingClientRect'] !== 'function')
  range['getBoundingClientRect'] = function getBoundingClientRect() {
    return new DOMRect();
  };

export {};
