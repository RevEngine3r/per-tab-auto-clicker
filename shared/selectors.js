// shared/selectors.js

/**
 * Heuristic selector generator. Keeps it simple for v1.
 * @param {Element} el
 * @returns {SelectorBundle}
 */
export function buildSelectorBundle(el) {
  const tagName = el.tagName.toLowerCase();
  const id = el.id || null;
  const classList = Array.from(el.classList || []);

  const primaryCssCandidates = [];

  if (id && isStableId(id)) {
    primaryCssCandidates.push(`#${cssEscape(id)}`);
  }

  const stableAttrSelector = buildStableAttributeSelector(el);
  if (stableAttrSelector) {
    primaryCssCandidates.push(stableAttrSelector);
  }

  const shortPath = buildShortCssPath(el);
  if (shortPath) {
    primaryCssCandidates.push(shortPath);
  }

  const primaryCss = primaryCssCandidates[0] || null;
  const fallbackCssList = primaryCssCandidates.slice(1);

  const textSnippet = extractTextSnippet(el);
  const ariaLabel = el.getAttribute("aria-label") || null;

  return {
    primaryCss,
    fallbackCssList,
    xpath: null,
    tagName,
    textSnippet,
    ariaLabel,
    idValue: id,
    classList
  };
}

function isStableId(id) {
  // Reject ids that look like hashes
  return !/^[a-f0-9]{8,}$/i.test(id);
}

function cssEscape(str) {
  // Basic escape for id/class usage
  return str.replace(/([!"#$%&'()*+,./:;<=>?@\[\]^`{|}~])/g, "\\$1");
}

function buildStableAttributeSelector(el) {
  const attrs = [
    "data-testid",
    "data-test-id",
    "data-qa",
    "name",
    "aria-label",
    "role"
  ];
  for (const attr of attrs) {
    const val = el.getAttribute(attr);
    if (val && isStableAttrValue(val)) {
      return `${el.tagName.toLowerCase()}[${attr}="${val}"]`;
    }
  }
  return null;
}

function isStableAttrValue(val) {
  return !/^[a-f0-9]{8,}$/i.test(val);
}

function buildShortCssPath(el) {
  const parts = [];
  let node = el;
  let depth = 0;
  while (node && node.nodeType === Node.ELEMENT_NODE && depth < 4) {
    let part = node.tagName.toLowerCase();
    if (node.id && isStableId(node.id)) {
      part += `#${cssEscape(node.id)}`;
      parts.unshift(part);
      break;
    }
    const classes = Array.from(node.classList || []).filter(isStableAttrValue);
    if (classes.length) {
      part += "." + classes.map(cssEscape).join(".");
    }
    const parent = node.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(node);
        part += `:nth-of-type(${index + 1})`;
      }
    }
    parts.unshift(part);
    node = node.parentElement;
    depth++;
  }
  return parts.length ? parts.join(" > ") : null;
}

function extractTextSnippet(el) {
  const text = (el.textContent || "").trim();
  if (!text) return null;
  if (text.length <= 60) return text;
  return text.slice(0, 57) + "...";
}

/**
 * Resolve selector bundle into a single element.
 */
export function resolveSelectorBundle(doc, bundle) {
  const selectors = [];
  if (bundle.primaryCss) selectors.push(bundle.primaryCss);
  selectors.push(...bundle.fallbackCssList);

  for (const sel of selectors) {
    try {
      const nodeList = doc.querySelectorAll(sel);
      if (nodeList.length === 1) {
        return { element: nodeList[0], matchedSelector: sel, matchedCount: 1 };
      }
      if (nodeList.length > 1) {
        return { element: nodeList[0], matchedSelector: sel, matchedCount: nodeList.length };
      }
    } catch (e) {
      // ignore invalid selector
    }
  }
  return { element: null, matchedSelector: null, matchedCount: 0 };
}
