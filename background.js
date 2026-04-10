const BADGE_COLOR = "#f97316";
const MAX_HISTORY_ITEMS = 20;
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

  try {
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  } catch (error) {
    // Ignore installation-time badge issues.
  }
});

chrome.runtime.onStartup.addListener(() => {
  void ensureDefaults();
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
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    void clearBadge(tabId);
  }
});
