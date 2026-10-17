/** Self-contained so Playwright can serialize it into the page without module closures. */
export function measureLandText(element: Element, search: string | undefined) {
  if (search !== undefined && search.length === 0) throw new Error("land text must not be empty");
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  let content = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    nodes.push({ node: text, start: content.length, end: content.length + text.data.length });
    content += text.data;
  }
  const start = search === undefined ? 0 : content.indexOf(search);
  if (start < 0) throw new Error("land text was not found inside the locator");
  const selected = search ?? content;
  const end = start + selected.length;
  if (end === start) return undefined;
  const rangeAt = (from: number, to: number) => {
    const a = nodes.find((entry) => entry.end > from)!;
    const b = nodes.find((entry) => entry.end >= to && entry.end > entry.start)!;
    const range = document.createRange();
    range.setStart(a.node, from - a.start);
    range.setEnd(b.node, to - b.start);
    return range;
  };
  const groups: Array<{ start: number; end: number; top: number; bottom: number }> = [];
  let offset = start;
  // Per-code-point ranges avoid nested element duplicate rects and preserve UTF-16 offsets.
  for (const character of selected) {
    const next = offset + character.length;
    const box = rangeAt(offset, next).getBoundingClientRect();
    if (box.width > 0 && box.height > 0) {
      const previous = groups.at(-1);
      const center = box.y + box.height / 2;
      if (previous && center >= previous.top && center <= previous.bottom) {
        previous.end = next;
        previous.top = Math.min(previous.top, box.top);
        previous.bottom = Math.max(previous.bottom, box.bottom);
      } else groups.push({ start: offset, end: next, top: box.top, bottom: box.bottom });
    }
    offset = next;
  }
  const rectOf = (box: DOMRect) => ({ x: box.x, y: box.y, width: box.width, height: box.height });
  const firstNode = nodes.find((entry) => entry.end > start)!;
  const style = getComputedStyle(firstNode.node.parentElement ?? element);
  const preserveSpace = /pre|break-spaces/.test(style.whiteSpace);
  const lines = groups.flatMap((group) => {
    const raw = content.slice(group.start, group.end);
    const leading = preserveSpace ? 0 : raw.length - raw.trimStart().length;
    const trailing = preserveSpace ? 0 : raw.length - raw.trimEnd().length;
    if (leading + trailing >= raw.length) return [];
    const range = rangeAt(group.start + leading, group.end - trailing);
    return [{ rect: rectOf(range.getBoundingClientRect()),
      text: preserveSpace ? raw : raw.trim().replace(/\s+/g, " ") }];
  });
  if (!lines.length) {
    if (search !== undefined) throw new Error("land text has no visible client rect");
    return undefined;
  }
  const left = Math.min(...lines.map((line) => line.rect.x));
  const top = Math.min(...lines.map((line) => line.rect.y));
  return { rect: { x: left, y: top,
    width: Math.max(...lines.map((line) => line.rect.x + line.rect.width)) - left,
    height: Math.max(...lines.map((line) => line.rect.y + line.rect.height)) - top },
    textStyle: { fontSize: parseFloat(style.fontSize), fontFamily: style.fontFamily,
      fontWeight: style.fontWeight, color: style.color },
    lines, lineCount: lines.length,
  };
}
