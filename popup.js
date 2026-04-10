const SUPPORT_PATTERN = /^https:\/\/(chatgpt\.com|chat\.openai\.com)(\/|$)/i;
const DEFAULT_SETTINGS = {
  autoApproveEnabled: true,
  badgeEnabled: true,
  historyEnabled: true
};
const DEFAULT_SECTION_STATE = {
  liveSectionOpen: true,
  settingsSectionOpen: true,
  historySectionOpen: true
};

const state = {
  tab: null,
  page: {
    ready: false,
    count: 0,
    candidates: []
  },
  history: [],
  settings: { ...DEFAULT_SETTINGS },
  sections: { ...DEFAULT_SECTION_STATE },
  refreshTimer: null
};

const refs = {
  clearHistoryButton: document.getElementById("clearHistoryButton"),
  autoApproveToggle: document.getElementById("autoApproveToggle"),
  badgeToggle: document.getElementById("badgeToggle"),
  historyToggle: document.getElementById("historyToggle"),
  liveSection: document.getElementById("liveSection"),
  settingsSection: document.getElementById("settingsSection"),
  historySection: document.getElementById("historySection"),
  summary: document.getElementById("summary"),
  statusPill: document.getElementById("statusPill"),
  promptCount: document.getElementById("promptCount"),
  promptList: document.getElementById("promptList"),
  settingsSummary: document.getElementById("settingsSummary"),
  historyCount: document.getElementById("historyCount"),
  historyList: document.getElementById("historyList"),
  notice: document.getElementById("notice")
};

function hasExtensionApis() {
  return Boolean(window.chrome?.tabs && window.chrome?.runtime?.id && window.chrome?.storage?.local);
}

function isSupportedUrl(url) {
  return SUPPORT_PATTERN.test(url || "");
}

function sanitizeSettings(raw = {}) {
  return {
    autoApproveEnabled: raw.autoApproveEnabled !== false,
    badgeEnabled: raw.badgeEnabled !== false,
    historyEnabled: raw.historyEnabled !== false
  };
}

async function safeStorageGet(defaults) {
  if (!hasExtensionApis()) {
    return { ...defaults };
  }

  try {
    return await chrome.storage.local.get(defaults);
  } catch (error) {
    return { ...defaults };
  }
}

async function safeStorageSet(values) {
  if (!hasExtensionApis()) {
    return false;
  }

  try {
    await chrome.storage.local.set(values);
    return true;
  } catch (error) {
    return false;
  }
}

async function loadSettings() {
  const stored = await safeStorageGet(DEFAULT_SETTINGS);
  state.settings = sanitizeSettings(stored);
}

async function loadSectionState() {
  const stored = await safeStorageGet(DEFAULT_SECTION_STATE);
  state.sections = {
    liveSectionOpen: stored.liveSectionOpen !== false,
    settingsSectionOpen: stored.settingsSectionOpen !== false,
    historySectionOpen: stored.historySectionOpen !== false
  };
}

async function loadHistory() {
  const stored = await safeStorageGet({ approvalHistory: [] });
  state.history = Array.isArray(stored.approvalHistory) ? stored.approvalHistory : [];
}

function formatRelativeTime(timestamp) {
  const value = Number(timestamp) || 0;
  const delta = Date.now() - value;

  if (delta < 60_000) {
    return "Just now";
  }

  if (delta < 3_600_000) {
    return `${Math.round(delta / 60_000)} min ago`;
  }

  if (delta < 86_400_000) {
    return `${Math.round(delta / 3_600_000)} hr ago`;
  }

  return `${Math.round(delta / 86_400_000)} day ago`;
}

function setNotice(message, tone = "muted") {
  refs.notice.textContent = message;
  refs.notice.classList.remove("is-success", "is-danger");

  if (tone === "success") {
    refs.notice.classList.add("is-success");
  }

  if (tone === "danger") {
    refs.notice.classList.add("is-danger");
  }
}

async function getActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  } catch (error) {
    return null;
  }
}

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
    return true;
  } catch (error) {
    return false;
  }
}

async function requestPageState() {
  if (!state.tab?.id) {
    return null;
  }

  const isReady = await ensureContentScript(state.tab.id);

  if (!isReady) {
    return null;
  }

  try {
    return await chrome.tabs.sendMessage(state.tab.id, { type: "REQUEST_STATE" });
  } catch (error) {
    return null;
  }
}

function renderPromptList() {
  refs.promptList.innerHTML = "";

  const candidates = Array.isArray(state.page?.candidates) ? state.page.candidates : [];
  refs.promptCount.textContent = String(candidates.length);

  if (!candidates.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No tool approval prompt is visible on this page right now.";
    refs.promptList.appendChild(empty);
    return;
  }

  candidates.forEach((candidate) => {
    const item = document.createElement("li");
    item.className = "prompt-item";
    const message = candidate.message || candidate.context || "Tool approval detected.";
    item.innerHTML = `
      <p class="item-title">${candidate.label || "Primary action"}</p>
      <p class="item-meta">${message}</p>
      <span class="item-score">Confidence ${candidate.score}</span>
    `;
    refs.promptList.appendChild(item);
  });
}

function renderSettings() {
  refs.autoApproveToggle.checked = state.settings.autoApproveEnabled;
  refs.badgeToggle.checked = state.settings.badgeEnabled;
  refs.historyToggle.checked = state.settings.historyEnabled;

  const enabledCount = Object.values(state.settings).filter(Boolean).length;
  refs.settingsSummary.textContent = `${enabledCount} active`;
}

function renderSectionState() {
  refs.liveSection.open = state.sections.liveSectionOpen;
  refs.settingsSection.open = state.sections.settingsSectionOpen;
  refs.historySection.open = state.sections.historySectionOpen;
}

function getHistoryMessage(entry) {
  return entry.message || entry.fullMessage || entry.context || entry.label || "Tool approval completed.";
}

function renderHistory() {
  refs.historyList.innerHTML = "";
  refs.historyCount.textContent = String(state.history.length);
  refs.clearHistoryButton.disabled = state.history.length === 0;

  if (!state.history.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = state.settings.historyEnabled
      ? "Approved prompts will appear here."
      : "Approval history is turned off.";
    refs.historyList.appendChild(empty);
    return;
  }

  state.history.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "history-item";
    const message = getHistoryMessage(entry);
    const showLabel = entry.label && entry.label !== message;
    item.innerHTML = `
      <p class="item-title">${message}</p>
      ${showLabel ? `<p class="item-meta">Action: ${entry.label}</p>` : ""}
      <span class="history-time">${formatRelativeTime(entry.createdAt)}</span>
    `;
    refs.historyList.appendChild(item);
  });
}

function renderState() {
  const isSupported = isSupportedUrl(state.tab?.url);
  const count = Number(state.page?.count) || 0;

  renderSettings();
  renderSectionState();
  renderPromptList();
  renderHistory();

  if (!hasExtensionApis()) {
    refs.summary.textContent = "This popup only works inside the installed Chrome extension.";
    refs.statusPill.textContent = "Unavailable";
    return;
  }

  if (!state.tab) {
    refs.summary.textContent = "No active browser tab was found in the current window.";
    refs.statusPill.textContent = "No tab";
    return;
  }

  if (!isSupported) {
    refs.summary.textContent = "Open ChatGPT to watch for tool approval prompts.";
    refs.statusPill.textContent = "Idle";
    return;
  }

  if (!state.page?.ready) {
    refs.summary.textContent = "The scanner has not attached to the current ChatGPT page yet. Leave this open for a moment or reopen the popup after the tab settles.";
    refs.statusPill.textContent = "Scanner not ready";
    return;
  }

  if (count > 0) {
    refs.summary.textContent = `Found ${count} tool approval prompt${count === 1 ? "" : "s"} on this page.`;
    refs.statusPill.textContent = `${count} live`;
  } else if (state.settings.autoApproveEnabled) {
    refs.summary.textContent = "Watching the active ChatGPT tab. Matching tool approvals will be clicked automatically.";
    refs.statusPill.textContent = "Watching";
  } else {
    refs.summary.textContent = "Watching the active ChatGPT tab. Auto-approve is paused.";
    refs.statusPill.textContent = "Paused";
  }
}

async function refreshState({ silent = true } = {}) {
  state.tab = await getActiveTab();

  if (!isSupportedUrl(state.tab?.url)) {
    state.page = { ready: false, count: 0, candidates: [] };
    renderState();
    if (!silent) {
      setNotice("Switch to ChatGPT to use the approval watcher.");
    }
    return;
  }

  const pageState = await requestPageState();
  state.page = pageState?.ok
    ? pageState
    : { ready: false, count: 0, candidates: [] };

  renderState();

  if (!pageState?.ok) {
    setNotice("The page could not be scanned. Refresh ChatGPT once and try again.", "danger");
  } else if (!silent) {
    setNotice(
      state.page.count
        ? "Live detection updated from the active ChatGPT tab."
        : "Scan complete. No tool approval prompt is visible right now."
    );
  }
}

async function handleClearHistory() {
  const saved = await safeStorageSet({ approvalHistory: [] });

  if (!saved) {
    setNotice("History could not be cleared right now.", "danger");
    return;
  }

  state.history = [];
  renderHistory();
  setNotice("Approval history cleared.", "success");
}

async function handleSettingChange(event) {
  const input = event.currentTarget;

  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  const key = input.dataset.setting;

  if (!key || !(key in DEFAULT_SETTINGS)) {
    return;
  }

  const saved = await safeStorageSet({ [key]: input.checked });

  if (!saved) {
    input.checked = state.settings[key];
    setNotice("That setting could not be saved right now.", "danger");
    return;
  }

  state.settings = {
    ...state.settings,
    [key]: input.checked
  };

  renderSettings();
  renderState();
  setNotice(`${input.checked ? "Enabled" : "Disabled"} ${input.dataset.label || "setting"}.`, "success");

  if (key === "autoApproveEnabled" || key === "badgeEnabled") {
    await refreshState();
  }
}

async function handleSectionToggle(event) {
  const section = event.currentTarget;

  if (!(section instanceof HTMLDetailsElement)) {
    return;
  }

  const key = section.id === "liveSection"
    ? "liveSectionOpen"
    : section.id === "settingsSection"
      ? "settingsSectionOpen"
      : "historySectionOpen";

  state.sections = {
    ...state.sections,
    [key]: section.open
  };

  await safeStorageSet({ [key]: section.open });
}

function handleStorageChange(changes, areaName) {
  if (areaName !== "local") {
    return;
  }

  if (changes.approvalHistory) {
    state.history = Array.isArray(changes.approvalHistory.newValue)
      ? changes.approvalHistory.newValue
      : [];
    renderHistory();
  }

  const settingKeys = Object.keys(DEFAULT_SETTINGS);
  const hasSettingChange = settingKeys.some((key) => key in changes);
  const sectionKeys = Object.keys(DEFAULT_SECTION_STATE);
  const hasSectionChange = sectionKeys.some((key) => key in changes);

  if (hasSectionChange) {
    sectionKeys.forEach((key) => {
      if (key in changes) {
        state.sections[key] = changes[key].newValue !== false;
      }
    });

    renderSectionState();
  }

  if (hasSettingChange) {
    const nextSettings = { ...state.settings };

    settingKeys.forEach((key) => {
      if (key in changes) {
        nextSettings[key] = changes[key].newValue !== false;
      }
    });

    state.settings = nextSettings;
    renderSettings();
    renderState();
  }
}

function startAutoRefresh() {
  window.clearInterval(state.refreshTimer);
  state.refreshTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") {
      void refreshState();
    }
  }, 1500);
}

async function init() {
  refs.autoApproveToggle.dataset.setting = "autoApproveEnabled";
  refs.autoApproveToggle.dataset.label = "auto-approve";
  refs.badgeToggle.dataset.setting = "badgeEnabled";
  refs.badgeToggle.dataset.label = "badge count";
  refs.historyToggle.dataset.setting = "historyEnabled";
  refs.historyToggle.dataset.label = "approval history";

  refs.clearHistoryButton.addEventListener("click", handleClearHistory);
  refs.autoApproveToggle.addEventListener("change", handleSettingChange);
  refs.badgeToggle.addEventListener("change", handleSettingChange);
  refs.historyToggle.addEventListener("change", handleSettingChange);
  refs.liveSection.addEventListener("toggle", handleSectionToggle);
  refs.settingsSection.addEventListener("toggle", handleSectionToggle);
  refs.historySection.addEventListener("toggle", handleSectionToggle);

  if (hasExtensionApis()) {
    chrome.storage.onChanged.addListener(handleStorageChange);
  }

  await Promise.all([loadSettings(), loadSectionState(), loadHistory()]);
  renderState();
  await refreshState();
  startAutoRefresh();
  window.addEventListener("unload", () => {
    window.clearInterval(state.refreshTimer);
  });
}

void init();
