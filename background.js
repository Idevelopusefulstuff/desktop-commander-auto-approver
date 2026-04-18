const BADGE_COLOR = "#f97316";
const MAX_HISTORY_ITEMS = 20;
const TAB_SWEEP_ALARM = "chatgpt-approval-sweep";
const TAB_SWEEP_PERIOD_MINUTES = 0.5;
const DEFAULT_SETTINGS = {
  autoApproveEnabled: true,
  badgeEnabled: true,
  historyEnabled: true
};

function sanitizeSettings(raw = {}) {
  return {
    autoApproveEnabled: raw.autoApproveEnabled !== false,
    badgeEnabled: raw.badgeEnabled !== false,
    historyEnabled: raw.historyEnabled !== false
  };
}

async function safeStorageGet(defaults) {
  try {
    return await chrome.storage.local.get(defaults);
  } catch (error) {
    return { ...defaults };
  }
}

async function safeStorageSet(values) {
  try {
    await chrome.storage.local.set(values);
    return true;
  } catch (error) {
    return false;
  }
}

async function getSettings() {
  const stored = await safeStorageGet(DEFAULT_SETTINGS);
  return sanitizeSettings(stored);
}

async function ensureDefaults() {
  const stored = await safeStorageGet(DEFAULT_SETTINGS);
  const nextValues = {};

  Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => {
    if (typeof stored[key] !== "boolean") {
      nextValues[key] = value;
    }
  });

  if (Object.keys(nextValues).length > 0) {
    await safeStorageSet(nextValues);
  }
}

async function clearBadge(tabId) {
  if (tabId === undefined) {
    return;
  }

  try {
    await chrome.action.setBadgeText({ tabId, text: "" });
  } catch (error) {
    // Ignore tabs that no longer exist.
  }
}

async function setBadge(tabId, count, settings = null) {
  if (tabId === undefined) {
    return;
  }

  const activeSettings = settings || await getSettings();

  try {
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId });
    await chrome.action.setBadgeText({
      tabId,
      text: activeSettings.badgeEnabled && count > 0 ? String(Math.min(count, 9)) : ""
    });
  } catch (error) {
    // Ignore badge updates for tabs that are gone or inaccessible.
  }
}

async function clearAllBadges() {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map((tab) => clearBadge(tab.id)));
  } catch (error) {
    // Ignore badge cleanup failures.
  }
}

function isChatgptUrl(url = "") {
  return /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//i.test(url);
}

async function ensureSweepAlarm() {
  try {
    await chrome.alarms.create(TAB_SWEEP_ALARM, {
      periodInMinutes: TAB_SWEEP_PERIOD_MINUTES
    });
  } catch (error) {
    // Ignore alarm creation failures on unsupported runtimes.
  }
}

async function ensureContentScript(tabId) {
  if (tabId === undefined) {
    return false;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
    return true;
  } catch (error) {
    return false;
  }
}

async function requestPromptState(tabId, reason = "background-sweep") {
  if (tabId === undefined) {
    return false;
  }

  const settings = await getSettings();

  if (!settings.autoApproveEnabled) {
    return false;
  }

  const injected = await ensureContentScript(tabId);

  if (!injected) {
    return false;
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "REQUEST_STATE",
      reason
    });
    return true;
  } catch (error) {
    return false;
  }
}

async function sweepChatTabs(reason = "background-sweep") {
  const settings = await getSettings();

  if (!settings.autoApproveEnabled) {
    return;
  }

  try {
    const tabs = await chrome.tabs.query({
      url: [
        "https://chatgpt.com/*",
        "https://chat.openai.com/*"
      ]
    });

    await Promise.all(tabs.map((tab) => requestPromptState(tab.id, reason)));
  } catch (error) {
    // Ignore sweep failures when tabs are inaccessible.
  }
}

async function appendHistoryEntry(entry) {
  const settings = await getSettings();

  if (!settings.historyEnabled) {
    return;
  }

  const stored = await safeStorageGet({ approvalHistory: [] });
  const currentHistory = Array.isArray(stored.approvalHistory) ? stored.approvalHistory : [];
  const nextHistory = [
    {
      label: entry.label || "Approved prompt",
      context: entry.context || "Tool approval completed.",
      message: entry.message || entry.context || entry.label || "Tool approval completed.",
      createdAt: entry.createdAt || Date.now()
    },
    ...currentHistory
  ].slice(0, MAX_HISTORY_ITEMS);

  await safeStorageSet({ approvalHistory: nextHistory });
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  await ensureSweepAlarm();

  try {
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  } catch (error) {
    // Ignore installation-time badge issues.
  }

  await sweepChatTabs("installed");
});

chrome.runtime.onStartup.addListener(() => {
  void ensureDefaults();
  void ensureSweepAlarm();
  void sweepChatTabs("startup");
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "PROMPT_STATE" && sender.tab?.id !== undefined) {
    void getSettings().then((settings) => {
      void setBadge(sender.tab.id, Number(message.count) || 0, settings);
    });
    return;
  }

  if (message?.type === "AUTO_APPROVED") {
    void appendHistoryEntry(message);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes.badgeEnabled?.newValue === false) {
    void clearAllBadges();
  }

  if (Object.prototype.hasOwnProperty.call(changes, "autoApproveEnabled")) {
    void sweepChatTabs("settings");
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    void clearBadge(tabId);
    return;
  }

  if (changeInfo.status === "complete" && isChatgptUrl(tab?.url)) {
    void requestPromptState(tabId, "tab-updated");
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);

    if (isChatgptUrl(tab.url)) {
      await requestPromptState(tabId, "tab-activated");
    }
  } catch (error) {
    // Ignore tab activation races.
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    return;
  }

  void chrome.tabs.query({ active: true, windowId }).then((tabs) => {
    const [tab] = tabs;

    if (tab?.id !== undefined && isChatgptUrl(tab.url)) {
      return requestPromptState(tab.id, "window-focus");
    }

    return null;
  }).catch(() => {
    // Ignore focus changes without accessible tabs.
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TAB_SWEEP_ALARM) {
    void sweepChatTabs("background-sweep");
  }
});
