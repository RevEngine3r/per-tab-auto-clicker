// shared/types.js

/** @typedef {Object} SelectorBundle
 * @property {string|null} primaryCss
 * @property {string[]} fallbackCssList
 * @property {string|null} xpath
 * @property {string} tagName
 * @property {string|null} textSnippet
 * @property {string|null} ariaLabel
 * @property {string|null} idValue
 * @property {string[]} classList
 */

/** @typedef {Object} TabConfig
 * @property {number} tabId
 * @property {number|null} windowId
 * @property {string|null} urlAtSelection
 * @property {string|null} originAtSelection
 * @property {boolean} enabled
 * @property {SelectorBundle|null} selector
 * @property {number} intervalMs
 * @property {number} durationSec
 * @property {"immediate"|"timeOfDay"} startMode
 * @property {string|null} startTimeHHMM
 * @property {"browser"} timezoneMode
 * @property {"programmatic"|"dispatchMouseSequence"} clickMode
 * @property {number|null} maxClicks
 * @property {boolean} stopOnError
 * @property {boolean} requireSameOrigin
 * @property {boolean} requireVisible
 * @property {number} jitterMs
 */

/** @typedef {Object} TabRuntime
 * @property {"idle"|"scheduled"|"running"|"paused"|"done"|"error"} status
 * @property {number|null} startedAtEpochMs
 * @property {number|null} stopAtEpochMs
 * @property {number|null} nextRunAtEpochMs
 * @property {number} clicksDone
 * @property {"success"|"not_found"|"not_visible"|"disabled"|"disabled"|"url_mismatch"|"error"|null} lastResult
 * @property {string|null} lastError
 * @property {number|null} lastRunAtEpochMs
 */

/** @typedef {Object} TabJobRecord
 * @property {TabConfig} config
 * @property {TabRuntime} runtime
 */

/** @typedef {Object} StorageShape
 * @property {Object.<string, TabJobRecord>} jobsByTabId
 * @property {number[]} activeJobTabIds
 * @property {number} schedulerVersion
 */

export const DEFAULT_INTERVAL_MS = 1000;
export const MIN_INTERVAL_MS = 250;
export const DEFAULT_DURATION_SEC = 60;
export const SCHEDULER_VERSION = 1;
