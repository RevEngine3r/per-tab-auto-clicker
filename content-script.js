// content-script.js

import { MESSAGE_TYPES } from "./shared/messages.js";
import { buildSelectorBundle, resolveSelectorBundle } from "./shared/selectors.js";

let pickerActive = false;
let overlayRoot = null;
let hoverBox = null;
let labelEl = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message || {};
  if (!type) return;

  if (type === MESSAGE_TYPES.PING_CONTENT_SCRIPT) {
    sendResponse({ ok: true });
    return;
  }

  if (type === MESSAGE_TYPES.PICKER_START) {
    startPicker();
    sendResponse({ ok: true });
    return;
  }

  if (type === MESSAGE_TYPES.PICKER_CANCEL) {
    stopPicker(false);
    sendResponse({ ok: true });
    return;
  }

  if (type === MESSAGE_TYPES.EXECUTE_CLICK) {
    handleExecuteClick(payload).then((result) => {
      sendClickResult(result);
      sendResponse({ ok: true });
    });
    return true;
  }
});

chrome.runtime.sendMessage({
  type: MESSAGE_TYPES.CONTENT_READY,
  payload: {}
});

function startPicker() {
  if (pickerActive) return;
  pickerActive = true;

  overlayRoot = document.createElement("div");
  overlayRoot.style.position = "fixed";
  overlayRoot.style.left = "0";
  overlayRoot.style.top = "0";
  overlayRoot.style.width = "100%";
  overlayRoot.style.height = "100%";
  overlayRoot.style.zIndex = "2147483647";
  overlayRoot.style.pointerEvents = "none";

  hoverBox = document.createElement("div");
  hoverBox.style.position = "absolute";
  hoverBox.style.border = "2px solid #00bcd4";
  hoverBox.style.backgroundColor = "rgba(0, 188, 212, 0.15)";
  hoverBox.style.pointerEvents = "none";

  labelEl = document.createElement("div");
  labelEl.style.position = "absolute";
  labelEl.style.background = "#00bcd4";
  labelEl.style.color = "#000";
  labelEl.style.fontSize = "12px";
  labelEl.style.padding = "2px 4px";
  labelEl.style.pointerEvents = "none";

  overlayRoot.appendChild(hoverBox);
  overlayRoot.appendChild(labelEl);
  document.documentElement.appendChild(overlayRoot);

  window.addEventListener("mousemove", onPickerMouseMove, true);
  window.addEventListener("click", onPickerClick, true);
  window.addEventListener("keydown", onPickerKeyDown, true);
}

function stopPicker(selected) {
  if (!pickerActive) return;
  pickerActive = false;

  window.removeEventListener("mousemove", onPickerMouseMove, true);
  window.removeEventListener("click", onPickerClick, true);
  window.removeEventListener("keydown", onPickerKeyDown, true);

  if (overlayRoot && overlayRoot.parentNode) {
    overlayRoot.parentNode.removeChild(overlayRoot);
  }
  overlayRoot = null;
  hoverBox = null;
  labelEl = null;

  if (!selected) {
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.PICKER_CANCELLED,
      payload: {}
    });
  }
}

function onPickerMouseMove(e) {
  const target = findHoverTarget(e.target);
  if (!target) return;

  const rect = target.getBoundingClientRect();
  hoverBox.style.left = `${rect.left + window.scrollX}px`;
  hoverBox.style.top = `${rect.top + window.scrollY}px`;
  hoverBox.style.width = `${rect.width}px`;
  hoverBox.style.height = `${rect.height}px`;

  const labelText = buildLabelText(target);
  labelEl.textContent = labelText;
  labelEl.style.left = `${rect.left + window.scrollX}px`;
  labelEl.style.top = `${rect.top + window.scrollY - 18}px`;
}

function onPickerClick(e) {
  e.preventDefault();
  e.stopPropagation();

  const target = findHoverTarget(e.target);
  if (!target) {
    stopPicker(false);
    return;
  }

  const selector = buildSelectorBundle(target);

  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.PICKER_RESULT,
    payload: {
      selector,
      urlAtSelection: window.location.href
    }
  });

  stopPicker(true);
}

function onPickerKeyDown(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    stopPicker(false);
  }
}

function findHoverTarget(target) {
  if (!target) return null;
  if (overlayRoot && overlayRoot.contains(target)) return null;
  return target.closest("body *");
}

function buildLabelText(el) {
  const parts = [el.tagName.toLowerCase()];
  if (el.id) parts.push(`#${el.id}`);
  const classes = Array.from(el.classList || []);
  if (classes.length) {
    parts.push("." + classes.join("."));
  }
  return parts.join("");
}

async function handleExecuteClick(payload) {
  const { selector, config } = payload;
  if (!selector) {
    return makeClickResult(false, "error", "No selector provided", null, 0);
  }

  const { element, matchedSelector, matchedCount } = resolveSelectorBundle(document, selector);
  if (!element) {
    return makeClickResult(false, "not_found", "Element not found", matchedSelector, matchedCount);
  }

  if (config.requireVisible && !isElementVisible(element)) {
    return makeClickResult(false, "not_visible", "Element not visible", matchedSelector, matchedCount);
  }

  try {
    if (config.clickMode === "dispatchMouseSequence") {
      dispatchMouseSequence(element);
    } else {
      element.click();
    }
    return makeClickResult(true, "success", null, matchedSelector, matchedCount);
  } catch (e) {
    return makeClickResult(false, "error", e instanceof Error ? e.message : String(e), matchedSelector, matchedCount);
  }
}

function makeClickResult(ok, code, message, matchedSelector, matchedCount) {
  return {
    ok,
    code,
    message,
    matchedSelector,
    matchedCount,
    timestamp: Date.now()
  };
}

function sendClickResult(result) {
  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.CLICK_RESULT,
    payload: { result }
  });
}

function isElementVisible(el) {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  if (rect.bottom < 0 || rect.right < 0) return false;
  if (rect.top > (window.innerHeight || document.documentElement.clientHeight)) return false;
  if (rect.left > (window.innerWidth || document.documentElement.clientWidth)) return false;
  return true;
}

function dispatchMouseSequence(el) {
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };

  el.dispatchEvent(new MouseEvent("mouseover", opts));
  el.dispatchEvent(new MouseEvent("mousedown", opts));
  el.dispatchEvent(new MouseEvent("mouseup", opts));
  el.dispatchEvent(new MouseEvent("click", opts));
}
