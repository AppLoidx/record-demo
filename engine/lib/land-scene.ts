import type { Rect } from "./timeline";

export type LandSceneSnapshot = { rects: WeakMap<Node, Rect>; replacements: Set<string> };

/** Browser callbacks are self-contained for Playwright serialization. */
export function snapshotLandScene() {
  const rects = new WeakMap<Node, Rect>();
  const replacements = new Set<string>();
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node: Node | null = document.documentElement; node; node = walker.nextNode()) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const box = node instanceof Element ? node.getBoundingClientRect() : range.getBoundingClientRect();
    const rect = { x: box.x, y: box.y, width: box.width, height: box.height };
    rects.set(node, rect);
    replacements.add(JSON.stringify([node.nodeType, node.textContent, rect]));
  }
  return { rects, replacements };
}

export function landSceneIsUnchanged(element: Element, snapshot: LandSceneSnapshot | undefined) {
  const box = element.getBoundingClientRect();
  if (box.x < 0 || box.y < 0 || box.right > innerWidth || box.bottom > innerHeight) return false;
  // A target inside a nested scrollport can be outside that scrollport while still
  // inside the page viewport. Do not invoke scrollIntoView to discover this.
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const clip = parent.getBoundingClientRect();
    const left = clip.left + parent.clientLeft;
    const top = clip.top + parent.clientTop;
    if (/auto|scroll|hidden|clip/.test(style.overflowX) && (box.left < left || box.right > left + parent.clientWidth)) return false;
    if (/auto|scroll|hidden|clip/.test(style.overflowY) && (box.top < top || box.bottom > top + parent.clientHeight)) return false;
  }
  if (!snapshot) return true;
  const unchanged = (node: Node) => {
    const before = snapshot.rects.get(node);
    const range = document.createRange(); range.selectNodeContents(node);
    const after = node instanceof Element ? node.getBoundingClientRect() : range.getBoundingClientRect();
    if (before) return before.x === after.x && before.y === after.y && before.width === after.width && before.height === after.height;
    // A framework may remount an unchanged message. Geometry, not DOM identity,
    // determines whether the frozen incoming pixels can be covered correctly.
    return snapshot.replacements.has(JSON.stringify([node.nodeType, node.textContent,
      { x: after.x, y: after.y, width: after.width, height: after.height }]));
  };
  if (!unchanged(element)) return false;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (!unchanged(node)) return false;
  return true;
}

export function landBackground(element: Element) {
  for (let current: Element | null = element; current; current = current.parentElement) {
    const color = getComputedStyle(current).backgroundColor;
    if (color === "transparent") continue;
    const alpha = color.startsWith("rgba(") ? color.slice(5, -1).split(",")[3]?.trim()
      : color.match(/\/\s*([\d.]+)\s*\)$/)?.[1];
    if (alpha !== undefined && Number(alpha) === 0) continue;
    return color;
  }
  return undefined;
}
