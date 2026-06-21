// service-worker.js

import { MESSAGE_TYPES, STORAGE_KEYS, API_OK, API_ERROR } from "./shared/messages.js";
import {
  loadStorageShape,
  saveStorageShape,
  getOrCreateJob,
  upsertJob,
  removeJob,
  addActiveJob,
  removeActiveJob
} from "./shared/storage.js";
import { DEFAULT_INTERVAL_MS, DEFAULT_DURATION_SEC } from "./shared/types.js";
import { validateConfig } from "./shared/validation.js";

const JOB_TICK_ALARM = "job-tick";

chrome.runtime.onInstalled.addListener(() => {
  ensureSchedulerAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  ensureSchedulerAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === JOB_TICK_ALARM) {
    handleJobTick();
  }
});

function ensureSchedulerAlarm() {
  chrome.alarms.get(JOB_TICK_ALARM, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(JOB_TICK_ALARM, {
        periodInMinutes: 0.1
      });
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message || {};
  if (!type) return;

  const handlerMap = {
    [MESSAGE_TYPES.GET_CURRENT_TAB_STATE]: handleGetCurrentTabState,
    [MESSAGE_TYPES.SAVE_CURRENT_TAB_CONFIG]: handleSaveCurrentTabConfig,
    [MESSAGE_TYPES.START_CURRENT_TAB_JOB]: handleStartCurrentTabJob,
    [MESSAGE_TYPES.STOP_CURRENT_TAB_JOB]: handleStopCurrentTabJob,
    [MESSAGE_TYPES.OPEN_PICKER_ON_CURRENT_TAB]: handleOpenPickerOnCurrentTab,
    [MESSAGE_TYPES.TEST_CLICK_CURRENT_TAB]: handleTestClickCurrentTab,
    [MESSAGE_TYPES.CLEAR_CURRENT_TAB_SELECTOR]: handleClearCurrentTabSelector,
    [MESSAGE_TYPES.PICKER_RESULT]: handlePickerResult,
    [MESSAGE_TYPES.PICKER_CANCELLED]: handlePickerCancelled,
    [MESSAGE_TYPES.CLICK_RESULT]: handleClickResult,
    [MESSAGE_TYPES.CONTENT_READY]: handleContentReady
  };

  const handler = handlerMap[type];
  if (!handler) return;

  (async () => {
    try {
      const result = await handler(payload, sender);
      sendResponse(API_OK(result));
    } catch (e) {
      sendResponse(API_ERROR(e instanceof Error ? e.message : String(e)));
    }
  })();

  return true; // async
});

async function handleGetCurrentTabState(payload, sender) {
  const tab = await getActiveTab();
  if (!tab) throw new Error("No active tab");

  const shape = await loadStorageShape();
  const job = getOrCreateJob(shape, tab.id, tab.windowId, tab.url);

  return { job, hostname: new URL(tab.url || "").hostname };
}

async function handleSaveCurrentTabConfig(payload, sender) {
  const tab = await getActiveTab();
  if (!tab) throw new Error("No active tab");

  const shape = await loadStorageShape();
  const job = getOrCreateJob(shape, tab.id, tab.windowId, tab.url);

  const updatedConfig = {
    ...job.config,
    ...payload
  };

  const errors = validateConfig(updatedConfig);
  if (errors.length) {
    throw new Error(errors.join("; "));
  }

  job.config = updatedConfig;
  upsertJob(shape, job);
  await saveStorageShape(shape);

  return job;
}

async function handleStartCurrentTabJob(payload, sender) {
  const tab = await getActiveTab();
  if (!tab) throw new Error("No active tab");

  const shape = await loadStorageShape();
  const job = getOrCreateJob(shape, tab.id, tab.windowId, tab.url);

  if (!job.config.selector) {
    throw new Error("No selector configured for this tab");
  }

  const now = Date.now();
  job.config.enabled = true;
  job.runtime.status = job.config.startMode === "timeOfDay" ? "scheduled" : "running";
  job.runtime.startedAtEpochMs = now;
  job.runtime.stopAtEpochMs = now + job.config.durationSec * 1000;
  job.runtime.nextRunAtEpochMs = now;
  job.runtime.clicksDone = 0;
  job.runtime.lastError = null;
  job.runtime.lastResult = null;

  addActiveJob(shape, job.config.tabId);
  upsertJob(shape, job);
  await saveStorageShape(shape);

  ensureSchedulerAlarm();

  return job;
}

async function handleStopCurrentTabJob(payload, sender) {
  const tab = await getActiveTab();
  if (!tab) throw new Error("No active tab");

  const shape = await loadStorageShape();
  const job = getOrCreateJob(shape, tab.id, tab.windowId, tab.url);

  job.config.enabled = false;
  job.runtime.status = "idle";
  job.runtime.nextRunAtEpochMs = null;
  job.runtime.stopAtEpochMs = null;

  removeActiveJob(shape, job.config.tabId);
  upsertJob(shape, job);
  await saveStorageShape(shape);

  return job;
}

async function handleOpenPickerOnCurrentTab(payload, sender) {
  const tab = await getActiveTab();
  if (!tab) throw new Error("No active tab");

  await ensureContentScript(tab.id);

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: MESSAGE_TYPES.PICKER_START
    });
  } catch (e) {
    throw new Error("Could not reach content script: " + e.message);
  }

  return { started: true };
}

async function handleTestClickCurrentTab(payload, sender) {
  const tab = await getActiveTab();
  if (!tab) throw new Error("No active tab");

  const shape = await loadStorageShape();
  const job = getOrCreateJob(shape, tab.id, tab.windowId, tab.url);

  if (!job.config.selector) {
    throw new Error("No selector configured for this tab");
  }

  await ensureContentScript(tab.id);
  await chrome.tabs.sendMessage(tab.id, {
    type: MESSAGE_TYPES.EXECUTE_CLICK,
    payload: {
      selector: job.config.selector,
      config: job.config
    }
  });

  return { dispatched: true };
}

async function handleClearCurrentTabSelector(payload, sender) {
  const tab = await getActiveTab();
  if (!tab) throw new Error("No active tab");

  const shape = await loadStorageShape();
  const job = getOrCreateJob(shape, tab.id, tab.windowId, tab.url);

  job.config.selector = null;
  job.runtime.status = "idle";

  upsertJob(shape, job);
  await saveStorageShape(shape);

  return job;
}

async function handlePickerResult(payload, sender) {
  const { selector, urlAtSelection } = payload;
  const tabId = sender.tab?.id;
  const windowId = sender.tab?.windowId;
  if (!tabId) throw new Error("Missing tab id in picker result");

  const shape = await loadStorageShape();
  const job = getOrCreateJob(shape, tabId, windowId, urlAtSelection);

  job.config.selector = selector;
  job.config.urlAtSelection = urlAtSelection || sender.tab?.url || null;
  job.config.originAtSelection = job.config.urlAtSelection ? new URL(job.config.urlAtSelection).origin : null;

  upsertJob(shape, job);
  await saveStorageShape(shape);

  return job;
}

async function handlePickerCancelled(payload, sender) {
  return { cancelled: true };
}

async function handleClickResult(payload, sender) {
  const { result } = payload;
  const tabId = sender.tab?.id;
  if (!tabId) throw new Error("Missing tab id in click result");

  const shape = await loadStorageShape();
  const key = String(tabId);
  const job = shape.jobsByTabId[key];
  if (!job) return { ignored: true };

  job.runtime.lastResult = result.code;
  job.runtime.lastError = result.ok ? null : result.message;
  job.runtime.lastRunAtEpochMs = result.timestamp;
  if (result.ok) {
    job.runtime.clicksDone += 1;
  }

  upsertJob(shape, job);
  await saveStorageShape(shape);

  return job;
}

async function handleContentReady(payload, sender) {
  return { ok: true };
}

async function handleJobTick() {
  const shape = await loadStorageShape();
  const now = Date.now();

  const activeIds = [...shape.activeJobTabIds];
  const promises = activeIds.map(async (tabId) => {
    const key = String(tabId);
    const job = shape.jobsByTabId[key];
    if (!job || !job.config.enabled) return;

    const runtime = job.runtime;

    if (runtime.stopAtEpochMs && now >= runtime.stopAtEpochMs) {
      runtime.status = "done";
      runtime.nextRunAtEpochMs = null;
      removeActiveJob(shape, tabId);
      upsertJob(shape, job);
      return;
    }

    if (job.config.startMode === "timeOfDay" && runtime.status === "scheduled") {
      const shouldStart = isTimeOfDayReached(job.config.startTimeHHMM);
      if (!shouldStart) return;
      runtime.status = "running";
      runtime.startedAtEpochMs = now;
      runtime.nextRunAtEpochMs = now;
    }

    if (runtime.status !== "running") return;

    if (runtime.nextRunAtEpochMs && now < runtime.nextRunAtEpochMs) return;

    const tab = await safeGetTab(tabId);
    if (!tab) {
      runtime.status = "error";
      runtime.lastError = "Tab not found";
      removeActiveJob(shape, tabId);
      upsertJob(shape, job);
      return;
    }

    if (job.config.requireSameOrigin && job.config.originAtSelection) {
      try {
        const currentOrigin = new URL(tab.url || "").origin;
        if (currentOrigin !== job.config.originAtSelection) {
          runtime.status = "error";
          runtime.lastResult = "url_mismatch";
          runtime.lastError = "Origin changed";
          removeActiveJob(shape, tabId);
          upsertJob(shape, job);
          return;
        }
      } catch (e) {
        // ignore URL parse error
      }
    }

    await ensureContentScript(tabId);

    const jitter = job.config.jitterMs || 0;
    const intervalWithJitter = job.config.intervalMs + randomJitter(jitter);

    runtime.nextRunAtEpochMs = now + intervalWithJitter;

    await chrome.tabs.sendMessage(tabId, {
      type: MESSAGE_TYPES.EXECUTE_CLICK,
      payload: {
        selector: job.config.selector,
        config: job.config
      }
    });
  });

  await Promise.allSettled(promises);
  await saveStorageShape(shape);
}

function randomJitter(jitterMs) {
  if (!jitterMs) return 0;
  const half = jitterMs / 2;
  return Math.round((Math.random() * jitterMs) - half);
}

function isTimeOfDayReached(hhmm) {
  if (!hhmm) return false;
  const [hh, mm] = hhmm.split(":").map((s) => parseInt(s, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return false;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = hh * 60 + mm;
  return nowMinutes >= targetMinutes;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] || null;
}

async function ensureContentScript(tabId) {
  // Retry up to 3 times, injecting on first failure and waiting for init
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.PING_CONTENT_SCRIPT });
      return; // content script is alive
    } catch (e) {
      if (attempt === 0) {
        // First failure: try to inject the script
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ["content-script.js"]
          });
        } catch (injectErr) {
          // Tab may be restricted (chrome://, extensions page, etc.)
          throw new Error("Cannot inject script into this page: " + injectErr.message);
        }
      }
      // Wait for the content script to initialize before retrying
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error("Content script did not become ready after injection");
}

async function safeGetTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch (e) {
    return null;
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    const shape = await loadStorageShape();
    const key = String(tabId);
    const job = shape.jobsByTabId[key];
    if (!job) return;

    if (job.config.requireSameOrigin && job.config.originAtSelection) {
      try {
        const currentOrigin = new URL(tab.url || "").origin;
        if (currentOrigin !== job.config.originAtSelection) {
          job.runtime.status = "paused";
          job.runtime.lastError = "Origin changed; job paused";
        }
      } catch (e) {
        // ignore
      }
    } else {
      if (job.runtime.status === "running") {
        job.runtime.status = "scheduled";
      }
    }

    upsertJob(shape, job);
    await saveStorageShape(shape);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const shape = await loadStorageShape();
  removeJob(shape, tabId);
  removeActiveJob(shape, tabId);
  await saveStorageShape(shape);
});
