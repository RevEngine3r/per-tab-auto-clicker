// popup.js

import { MESSAGE_TYPES } from "./shared/messages.js";

const hostnameEl = document.getElementById("hostname");
const statusChipEl = document.getElementById("status-chip");
const selectorSummaryEl = document.getElementById("selector-summary");
const enableToggleEl = document.getElementById("enable-toggle");
const intervalMsEl = document.getElementById("interval-ms");
const durationSecEl = document.getElementById("duration-sec");
const startModeEl = document.getElementById("start-mode");
const timeOfDayRowEl = document.getElementById("time-of-day-row");
const startTimeEl = document.getElementById("start-time");
const stopOnErrorEl = document.getElementById("stop-on-error");
const requireSameOriginEl = document.getElementById("require-same-origin");
const requireVisibleEl = document.getElementById("require-visible");
const maxClicksEl = document.getElementById("max-clicks");
const jitterMsEl = document.getElementById("jitter-ms");
const clicksDoneEl = document.getElementById("clicks-done");
const lastRunEl = document.getElementById("last-run");
const nextRunEl = document.getElementById("next-run");
const lastResultEl = document.getElementById("last-result");
const lastErrorEl = document.getElementById("last-error");
const errorBannerEl = document.getElementById("error-banner");

const pickElementBtn = document.getElementById("pick-element");
const testClickBtn = document.getElementById("test-click");
const clearSelectorBtn = document.getElementById("clear-selector");
const saveConfigBtn = document.getElementById("save-config");
const startJobBtn = document.getElementById("start-job");
const stopJobBtn = document.getElementById("stop-job");

let currentJob = null;

init();

function init() {
  startModeEl.addEventListener("change", () => {
    timeOfDayRowEl.style.display = startModeEl.value === "timeOfDay" ? "flex" : "none";
  });

  pickElementBtn.addEventListener("click", onPickElement);
  testClickBtn.addEventListener("click", onTestClick);
  clearSelectorBtn.addEventListener("click", onClearSelector);
  saveConfigBtn.addEventListener("click", onSaveConfig);
  startJobBtn.addEventListener("click", onStartJob);
  stopJobBtn.addEventListener("click", onStopJob);

  loadCurrentTabState();
}

async function loadCurrentTabState() {
  try {
    const resp = await sendMessage(MESSAGE_TYPES.GET_CURRENT_TAB_STATE, {});
    if (!resp.ok) throw new Error(resp.error || "Unknown error");

    const { job, hostname } = resp.data;
    currentJob = job;

    hostnameEl.textContent = hostname || "";
    renderJob(job);
  } catch (e) {
    showError(e.message);
  }
}

function renderJob(job) {
  const cfg = job.config;
  const rt = job.runtime;

  enableToggleEl.checked = cfg.enabled;
  intervalMsEl.value = cfg.intervalMs;
  durationSecEl.value = cfg.durationSec;
  startModeEl.value = cfg.startMode;
  startTimeEl.value = cfg.startTimeHHMM || "";
  timeOfDayRowEl.style.display = cfg.startMode === "timeOfDay" ? "flex" : "none";
  stopOnErrorEl.checked = cfg.stopOnError;
  requireSameOriginEl.checked = cfg.requireSameOrigin;
  requireVisibleEl.checked = cfg.requireVisible;
  maxClicksEl.value = cfg.maxClicks ?? "";
  jitterMsEl.value = cfg.jitterMs;

  selectorSummaryEl.textContent = summarizeSelector(cfg.selector);

  setStatusChip(rt.status);

  clicksDoneEl.textContent = rt.clicksDone;
  lastRunEl.textContent = rt.lastRunAtEpochMs ? new Date(rt.lastRunAtEpochMs).toLocaleTimeString() : "-";
  nextRunEl.textContent = rt.nextRunAtEpochMs ? new Date(rt.nextRunAtEpochMs).toLocaleTimeString() : "-";
  lastResultEl.textContent = rt.lastResult || "-";
  lastErrorEl.textContent = rt.lastError || "-";

  startJobBtn.disabled = !cfg.selector;
}

function summarizeSelector(sel) {
  if (!sel) return "No selector chosen";
  if (sel.primaryCss) return sel.primaryCss;
  if (sel.fallbackCssList && sel.fallbackCssList.length) return sel.fallbackCssList[0];
  return sel.tagName || "Unknown";
}

function setStatusChip(status) {
  statusChipEl.className = "status-chip";
  let label = status;
  if (status === "running") {
    statusChipEl.classList.add("status-running");
    label = "Running";
  } else if (status === "scheduled") {
    statusChipEl.classList.add("status-scheduled");
    label = "Scheduled";
  } else if (status === "error") {
    statusChipEl.classList.add("status-error");
    label = "Error";
  } else {
    statusChipEl.classList.add("status-idle");
    label = "Idle";
  }
  statusChipEl.textContent = label;
}

async function onPickElement() {
  clearError();
  try {
    const resp = await sendMessage(MESSAGE_TYPES.OPEN_PICKER_ON_CURRENT_TAB, {});
    if (!resp.ok) throw new Error(resp.error || "Failed to start picker");
  } catch (e) {
    showError(e.message);
  }
}

async function onTestClick() {
  clearError();
  try {
    const resp = await sendMessage(MESSAGE_TYPES.TEST_CLICK_CURRENT_TAB, {});
    if (!resp.ok) throw new Error(resp.error || "Failed to test click");
  } catch (e) {
    showError(e.message);
  }
}

async function onClearSelector() {
  clearError();
  try {
    const resp = await sendMessage(MESSAGE_TYPES.CLEAR_CURRENT_TAB_SELECTOR, {});
    if (!resp.ok) throw new Error(resp.error || "Failed to clear selector");
    currentJob = resp.data;
    renderJob(currentJob);
  } catch (e) {
    showError(e.message);
  }
}

async function onSaveConfig() {
  clearError();
  if (!currentJob) return;

  const payload = {
    enabled: enableToggleEl.checked,
    intervalMs: Number(intervalMsEl.value) || 0,
    durationSec: Number(durationSecEl.value) || 0,
    startMode: startModeEl.value,
    startTimeHHMM: startModeEl.value === "timeOfDay" && startTimeEl.value ? startTimeEl.value : null,
    stopOnError: stopOnErrorEl.checked,
    requireSameOrigin: requireSameOriginEl.checked,
    requireVisible: requireVisibleEl.checked,
    maxClicks: maxClicksEl.value ? Number(maxClicksEl.value) : null,
    jitterMs: Number(jitterMsEl.value) || 0
  };

  try {
    const resp = await sendMessage(MESSAGE_TYPES.SAVE_CURRENT_TAB_CONFIG, payload);
    if (!resp.ok) throw new Error(resp.error || "Failed to save config");
    currentJob = resp.data;
    renderJob(currentJob);
  } catch (e) {
    showError(e.message);
  }
}

async function onStartJob() {
  clearError();
  try {
    const resp = await sendMessage(MESSAGE_TYPES.START_CURRENT_TAB_JOB, {});
    if (!resp.ok) throw new Error(resp.error || "Failed to start job");
    currentJob = resp.data;
    renderJob(currentJob);
  } catch (e) {
    showError(e.message);
  }
}

async function onStopJob() {
  clearError();
  try {
    const resp = await sendMessage(MESSAGE_TYPES.STOP_CURRENT_TAB_JOB, {});
    if (!resp.ok) throw new Error(resp.error || "Failed to stop job");
    currentJob = resp.data;
    renderJob(currentJob);
  } catch (e) {
    showError(e.message);
  }
}

function showError(msg) {
  errorBannerEl.textContent = msg;
  errorBannerEl.classList.remove("hidden");
}

function clearError() {
  errorBannerEl.textContent = "";
  errorBannerEl.classList.add("hidden");
}

function sendMessage(type, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (resp) => {
      resolve(resp || { ok: false, error: chrome.runtime.lastError?.message || "No response" });
    });
  });
}
