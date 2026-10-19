(() => {
  "use strict";
  const MESSAGE = '.c-message_kit__text, .c-message__body, [data-qa="message-text"], .p-rich_text_block';
  const EDITOR = '[contenteditable]:not([contenteditable="false"]), [role="textbox"], .ql-editor';
  const EXCLUDED = `code, pre, script, style, textarea, input, select, button, a, .katex, .smv-view, ${EDITOR}`;
  const BLOCKS = new Set(["DIV", "P", "LI", "UL", "OL", "BLOCKQUOTE", "SECTION"]);
  const states = new Map();
  const pending = new Set();
  let enabled = true;
  let timer;

  function eligible(element) {
    return element?.isConnected && element.matches(MESSAGE) && !element.closest(`.smv-view, ${EDITOR}`);
  }

  function outerMessage(element) {
    let result = element.closest(MESSAGE);
    if (!result || result.closest(`.smv-view, ${EDITOR}`)) return null;
    let parent = result.parentElement?.closest(MESSAGE);
    while (parent) {
      result = parent;
      parent = result.parentElement?.closest(MESSAGE);
    }
    return eligible(result) ? result : null;
  }

  function collect(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element || element.closest(".smv-view")) return;
    const ancestor = outerMessage(element);
    if (ancestor) pending.add(ancestor);
    else element.querySelectorAll(MESSAGE).forEach(child => {
      const root = outerMessage(child);
      if (root) pending.add(root);
    });
  }

  // Flatten only for finding ranges. The rendered copy keeps Slack's formatting.
  // Virtual newlines let display math span <br> and paragraph boundaries.
  function textStream(root) {
    const spans = [];
    const chunks = [];
    let length = 0;
    function append(value, node) {
      if (node) spans.push({ node, start: length, end: length + value.length });
      chunks.push(value);
      length += value.length;
    }
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        append(node.data, node);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node !== root && node.matches(EXCLUDED)) {
        append("\0");
        return;
      }
      if (node.tagName === "BR") {
        append("\n");
        return;
      }
      const block = node !== root && BLOCKS.has(node.tagName);
      if (block) append("\n");
      node.childNodes.forEach(walk);
      if (block) append("\n");
    }
    walk(root);
    return { text: chunks.join(""), spans };
  }

  function renderCopy(source) {
    const body = source.cloneNode(true);
    body.classList.remove("smv-source-hidden");
    body.classList.add("smv-body");
    body.removeAttribute("id");
    body.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    // Retain the original targets for Slack's delegated link/mention actions.
    const originals = [source, ...source.querySelectorAll("*")];
    const copies = [body, ...body.querySelectorAll("*")];
    const originalFor = new WeakMap(copies.map((copy, i) => [copy, originals[i]]));
    const { text, spans } = textStream(body);
    if (text.length > 200000) return null;
    const matches = SlackMathParser.findMath(text).slice(0, 300);
    let count = 0;
    for (const match of matches.reverse()) {
      if (match.tex.length > 12000) continue;
      const start = spans.find(s => s.start <= match.start && s.end > match.start);
      const end = spans.find(s => s.start < match.end && s.end >= match.end);
      if (!start || !end) continue;
      const equation = document.createElement("span");
      equation.className = `smv-equation${match.display ? " smv-display" : ""}`;
      equation.title = text.slice(match.start, match.end);
      try {
        katex.render(match.tex, equation, {
          displayMode: match.display,
          throwOnError: true,
          trust: false,
          strict: "ignore",
          output: "htmlAndMathml",
          maxExpand: 1000,
          maxSize: 20,
        });
        const range = document.createRange();
        range.setStart(start.node, match.start - start.start);
        range.setEnd(end.node, match.end - end.start);
        range.deleteContents();
        range.insertNode(equation);
        count++;
      } catch {
        // Unsupported or malformed TeX stays readable as its exact source.
      }
    }
    if (!count) return null;
    body.addEventListener("click", event => {
      if (event.target.closest(".smv-equation")) return;
      const target = event.target.closest('a, button, [role="button"], [data-member-id], [data-channel-id]');
      const original = originalFor.get(target);
      if (!original?.isConnected) return;
      event.preventDefault();
      event.stopPropagation();
      original.dispatchEvent(new MouseEvent("click", {
        bubbles: true, cancelable: true, view: window,
        ctrlKey: event.ctrlKey, metaKey: event.metaKey,
        shiftKey: event.shiftKey, altKey: event.altKey, button: event.button,
      }));
    });
    return body;
  }

  function removeView(source) {
    states.get(source)?.view.remove();
    source.classList.remove("smv-source-hidden");
    states.delete(source);
  }

  function render(source) {
    const previous = states.get(source);
    const signature = source.innerHTML;
    if (previous?.signature === signature && source.nextElementSibling === previous.view) return;
    const showSource = previous?.showSource ?? false;
    removeView(source);
    const body = renderCopy(source);
    if (!body) return;
    const view = document.createElement("div");
    view.className = "smv-view";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "smv-source-toggle";
    const state = { view, body, button, signature, showSource };
    function applyMode() {
      source.classList.toggle("smv-source-hidden", !state.showSource);
      body.hidden = state.showSource;
      button.textContent = state.showSource ? "Show math" : "Show original";
      button.setAttribute("aria-label", state.showSource ? "Show rendered math for this message" : "Show original text for this message");
    }
    button.addEventListener("click", event => {
      event.stopPropagation();
      // Apply pending Slack changes before temporarily pausing observation.
      receive(observer.takeRecords());
      observer.disconnect();
      state.showSource = !state.showSource;
      applyMode();
      observe();
    });
    view.append(body, button);
    source.after(view);
    states.set(source, state);
    applyMode();
  }

  function schedule() {
    if (!timer) timer = setTimeout(flush, 60);
  }

  function flush() {
    timer = undefined;
    receive(observer.takeRecords(), false);
    observer.disconnect();
    try {
      for (const [source, state] of states) {
        if (!enabled || !eligible(source) || outerMessage(source) !== source) removeView(source);
        else if (!state.view.isConnected || source.nextElementSibling !== state.view) pending.add(source);
      }
      if (enabled) {
        for (const source of pending) {
          if (!eligible(source) || outerMessage(source) !== source) continue;
          try { render(source); }
          catch { removeView(source); }
        }
      }
    } finally {
      pending.clear();
      observe();
    }
  }

  function receive(records, shouldSchedule = true) {
    if (!enabled || !records.length) return;
    for (const record of records) {
      collect(record.target);
      record.addedNodes?.forEach(collect);
    }
    // Also sweep disconnected sources when Slack recycles/removes message rows.
    if (shouldSchedule) schedule();
  }

  const observer = new MutationObserver(receive);
  function observe() {
    if (enabled) observer.observe(document.body, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ["contenteditable"],
    });
  }

  function setEnabled(value) {
    enabled = value !== false;
    if (enabled) collect(document.body);
    schedule();
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.enabled) setEnabled(changes.enabled.newValue);
  });
  chrome.storage.local.get({ enabled: true }).then(settings => {
    setEnabled(settings.enabled);
  }).catch(() => setEnabled(true));
})();
