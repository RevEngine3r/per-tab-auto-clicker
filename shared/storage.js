// shared/storage.js

import { STORAGE_KEYS, API_OK, API_ERROR } from "./messages.js";
import { DEFAULT_INTERVAL_MS, DEFAULT_DURATION_SEC, SCHEDULER_VERSION } from "./types.js";

/**
 * @returns {Promise<StorageShape>}
 */
export async function loadStorageShape() {
  const result = await chrome.storage.local.get({
    [STORAGE_KEYS.JOBS_BY_TAB_ID]: {},
    [STORAGE_KEYS.ACTIVE_JOB_TAB_IDS]: [],
    [STORAGE_KEYS.SCHEDULER_VERSION]: SCHEDULER_VERSION
  });

  return {
    jobsByTabId: result[STORAGE_KEYS.JOBS_BY_TAB_ID] || {},
    activeJobTabIds: result[STORAGE_KEYS.ACTIVE_JOB_TAB_IDS] || [],
    schedulerVersion: result[STORAGE_KEYS.SCHEDULER_VERSION] || SCHEDULER_VERSION
  };
}

/**
 * @param {StorageShape} shape
 */
export async function saveStorageShape(shape) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.JOBS_BY_TAB_ID]: shape.jobsByTabId,
    [STORAGE_KEYS.ACTIVE_JOB_TAB_IDS]: shape.activeJobTabIds,
    [STORAGE_KEYS.SCHEDULER_VERSION]: shape.schedulerVersion
  });
}

export function buildDefaultConfig(tabId, windowId, url) {
  const urlObj = url ? new URL(url) : null;
  return {
    tabId,
    windowId,
    urlAtSelection: url || null,
    originAtSelection: urlObj ? urlObj.origin : null,
    enabled: false,
    selector: null,
    intervalMs: DEFAULT_INTERVAL_MS,
    durationSec: DEFAULT_DURATION_SEC,
    startMode: "immediate",
    startTimeHHMM: null,
    timezoneMode: "browser",
    clickMode: "programmatic",
    maxClicks: null,
    stopOnError: true,
    requireSameOrigin: true,
    requireVisible: true,
    jitterMs: 0
  };
}

export function buildDefaultRuntime() {
  return {
    status: "idle",
    startedAtEpochMs: null,
    stopAtEpochMs: null,
    nextRunAtEpochMs: null,
    clicksDone: 0,
    lastResult: null,
    lastError: null,
    lastRunAtEpochMs: null
  };
}

export function getOrCreateJob(shape, tabId, windowId, url) {
  const key = String(tabId);
  const existing = shape.jobsByTabId[key];
  if (existing) return existing;

  const config = buildDefaultConfig(tabId, windowId, url);
  const runtime = buildDefaultRuntime();
  const record = { config, runtime };
  shape.jobsByTabId[key] = record;
  return record;
}

export function upsertJob(shape, job) {
  const key = String(job.config.tabId);
  shape.jobsByTabId[key] = job;
}

export function removeJob(shape, tabId) {
  const key = String(tabId);
  delete shape.jobsByTabId[key];
}

export function addActiveJob(shape, tabId) {
  if (!shape.activeJobTabIds.includes(tabId)) {
    shape.activeJobTabIds.push(tabId);
  }
}

export function removeActiveJob(shape, tabId) {
  shape.activeJobTabIds = shape.activeJobTabIds.filter((id) => id !== tabId);
}

export function apiWrap(fn) {
  return async (...args) => {
    try {
      const data = await fn(...args);
      return API_OK(data);
    } catch (e) {
      return API_ERROR(e instanceof Error ? e.message : String(e));
    }
  };
}
