/* Shared by the content script and Node tests; no page globals are required. */
(() => {
  "use strict";
  const delimiters = [
    { open: "$$", close: "$$", display: true },
    { open: "\\[", close: "\\]", display: true },
    { open: "\\(", close: "\\)", display: false },
    { open: "$", close: "$", display: false },
  ];

  function escaped(text, index) {
    let count = 0;
    while (index > 0 && text[--index] === "\\") count++;
    return count % 2 === 1;
  }

  function findMath(text) {
    const matches = [];
    for (let i = 0; i < text.length; i++) {
      const delimiter = delimiters.find(d => text.startsWith(d.open, i));
      if (!delimiter || escaped(text, i)) continue;
      const start = i + delimiter.open.length;
      if (delimiter.open === "$" && (text[i - 1] === "$" || /\s/.test(text[start] || ""))) continue;
      let braces = 0;
      let end = -1;
      for (let j = start; j < Math.min(text.length, start + 12002); j++) {
        // NUL separates code, links, controls and other excluded content.
        if (text[j] === "\0" || (!delimiter.display && text[j] === "\n")) break;
        if (escaped(text, j)) continue;
        if (braces === 0 && text.startsWith(delimiter.close, j)) {
          if (delimiter.open === "$" && (text[j + 1] === "$" || /\s/.test(text[j - 1]))) break;
          end = j;
          break;
        }
        if (text[j] === "{") braces++;
        if (text[j] === "}") braces = Math.max(0, braces - 1);
      }
      if (end < 0) {
        // Never reinterpret half of an unmatched $$ as an inline opener.
        i += delimiter.open.length - 1;
        continue;
      }
      const tex = text.slice(start, end).trim();
      // Avoid common currency such as "$5 and $10", but accept $2$, $4\\times$.
      const isCurrency = delimiter.open === "$" && /^\d/.test(tex) &&
        (/^\d/.test(text[end + 1] || "") || /^\d[\d,.]*\s+(?:and|or|to)\b/i.test(tex));
      if (tex && !isCurrency) {
        matches.push({ start: i, end: end + delimiter.close.length, tex, display: delimiter.display });
      }
      i = end + delimiter.close.length - 1;
    }
    return matches;
  }

  globalThis.SlackMathParser = Object.freeze({ findMath });
})();
