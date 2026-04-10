(() => {
  const INSTALL_VERSION = "2026-04-09-1";

  if (window.__chatgptApprovalConsoleVersion === INSTALL_VERSION) {
    return;
  }

  if (typeof window.__chatgptApprovalConsoleCleanup === "function") {
    try {
      window.__chatgptApprovalConsoleCleanup();
    } catch (error) {
      // Ignore cleanup failures from prior injected versions.
    }
  }

  window.__chatgptApprovalConsoleVersion = INSTALL_VERSION;

  const BUTTON_PATTERNS = [
    { pattern: /^start process$/i, score: 7 },
    { pattern: /^approve$/i, score: 5 },
    { pattern: /^allow$/i, score: 5 },
    { pattern: /^confirm$/i, score: 4 },
    { pattern: /^run(?: tool)?$/i, score: 4 },
    { pattern: /^set\b/i, score: 4 },
    { pattern: /^grant\b/i, score: 4 },
    { pattern: /^enable\b/i, score: 4 },
    { pattern: /^proceed\b/i, score: 3 },
    { pattern: /^use\b/i, score: 3 },
    { pattern: /^save\b/i, score: 3 },
    { pattern: /^ok(?:ay)?$/i, score: 3 },
    { pattern: /^continue$/i, score: 2 },
    { pattern: /^yes$/i, score: 1 }
  ];

  const NEGATIVE_BUTTON_PATTERNS = [
    /^deny$/i,
    /^cancel$/i,
    /^reject$/i,
    /^block$/i,
    /^dismiss$/i,
    /^not now$/i,
    /^no$/i,
    /^close$/i
  ];

  const IGNORED_BUTTON_PATTERNS = [
    /^share$/i,
    /^copy(?: response)?$/i,
    /^edit$/i,
    /^retry$/i,
    /^regenerate$/i,
    /^read aloud$/i,
    /^good response$/i,
    /^bad response$/i,
    /^thumbs up$/i,
    /^thumbs down$/i,
    /^more$/i
  ];

  const CONTEXT_PATTERNS = [
    /desktop commander/i,
    /allowed directories/i,
    /alloweddirectories/i,
    /configure desktop commander/i,
    /allow full system access via desktop commander/i,
    /access granted for desktop commander/i,
    /using tools comes with risks/i,
    /tools comes with risks/i
  ];
  const DESKTOP_COMMANDER_PATTERN = /desktop commander/i;

  const AUTO_APPROVE_DELAY_MS = 180;
  const AUTO_APPROVE_VERIFY_MS = 420;
  const AUTO_APPROVE_COOLDOWN_MS = 6000;
  const AUTO_APPROVE_MAX_ATTEMPTS = 3;
  const HEARTBEAT_SYNC_MS = 1800;

  const state = {
    broadcastTimer: null,
    autoApproveTimer: null,
    heartbeatTimer: null,
    autoApproveCache: new Map(),
    lastSignature: "",
    styleInjected: false
  };
  const DEFAULT_SETTINGS = {
    autoApproveEnabled: true,
    badgeEnabled: true,
    historyEnabled: true
  };
  const settings = { ...DEFAULT_SETTINGS };

  function normalizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function sanitizeSettings(raw = {}) {
    return {
      autoApproveEnabled: raw.autoApproveEnabled !== false,
      badgeEnabled: raw.badgeEnabled !== false,
      historyEnabled: raw.historyEnabled !== false
    };
  }

  async function loadSettings() {
    try {
      const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
      Object.assign(settings, sanitizeSettings(stored));
    } catch (error) {
      Object.assign(settings, DEFAULT_SETTINGS);
    }
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function getLabelScore(label) {
    for (const rule of BUTTON_PATTERNS) {
      if (rule.pattern.test(label)) {
        return rule.score;
      }
    }

    return 0;
  }

  function isNegativeLabel(label) {
    return NEGATIVE_BUTTON_PATTERNS.some((pattern) => pattern.test(label));
  }

  function isIgnoredLabel(label) {
    return IGNORED_BUTTON_PATTERNS.some((pattern) => pattern.test(label));
  }

  function getButtonLabel(button) {
    if (button instanceof HTMLInputElement) {
      return normalizeText(
        button.value ||
        button.getAttribute("aria-label") ||
        button.getAttribute("title")
      );
    }

    return normalizeText(
      button.getAttribute("aria-label") ||
      button.getAttribute("title") ||
      button.innerText ||
      button.textContent
    );
  }

  function getInteractiveCandidates() {
    return Array.from(document.querySelectorAll(
      'button, [role="button"], input[type="button"], input[type="submit"]'
    ));
  }

  function hasClassToken(element, token) {
    return typeof element.className === "string" && element.className.includes(token);
  }

  function isPrimaryApprovalButton(button) {
    return button instanceof HTMLElement && hasClassToken(button, "btn-primary");
  }

  function isSecondaryApprovalButton(button) {
    return button instanceof HTMLElement && hasClassToken(button, "btn-secondary");
  }

  function getApprovalCard(button, interactiveCandidates) {
    let current = button;
    let depth = 0;

    while (current && depth < 12) {
      if (current instanceof HTMLElement) {
        const text = normalizeText(current.innerText || current.textContent);
        const visibleButtons = interactiveCandidates.filter((candidate) => {
          return candidate instanceof HTMLElement && current.contains(candidate) && isVisible(candidate);
        });
        const primaryButtons = visibleButtons.filter((candidate) => isPrimaryApprovalButton(candidate));
        const secondaryButtons = visibleButtons.filter((candidate) => isSecondaryApprovalButton(candidate));

        if (
          DESKTOP_COMMANDER_PATTERN.test(text) &&
          primaryButtons.length === 1 &&
          secondaryButtons.length === 1 &&
          visibleButtons.length <= 5
        ) {
          return current;
        }
      }

      current = current.parentElement;
      depth += 1;
    }

    return null;
  }

  function getDialogContainer(element, interactiveCandidates) {
    const approvalCard = getApprovalCard(element, interactiveCandidates);

    if (approvalCard) {
      return approvalCard;
    }

    const directDialog = element.closest('[role="dialog"], dialog, [data-radix-portal]');

    if (directDialog instanceof HTMLElement) {
      return directDialog;
    }

    let current = element.parentElement;
    let depth = 0;

    while (current && depth < 6) {
      const text = normalizeText(current.innerText || current.textContent);
      const visibleLabels = interactiveCandidates
        .filter((candidate) => candidate instanceof HTMLElement && current.contains(candidate) && isVisible(candidate))
        .map((candidate) => getButtonLabel(candidate))
        .filter(Boolean);
      const hasNegativeAction = visibleLabels.some((label) => isNegativeLabel(label));
      const positiveLabels = visibleLabels.filter((label) => {
        return !isNegativeLabel(label) && !isIgnoredLabel(label);
      });

      if (
        CONTEXT_PATTERNS.some((pattern) => pattern.test(text)) &&
        hasNegativeAction &&
        positiveLabels.length > 0 &&
        visibleLabels.length <= 6
      ) {
        return current;
      }

      current = current.parentElement;
      depth += 1;
    }

    return null;
  }

  function hasNegativeSiblingAction(container, activeElement, interactiveCandidates) {
    if (!(container instanceof HTMLElement)) {
      return false;
    }

    return interactiveCandidates.some((candidate) => {
      if (!(candidate instanceof HTMLElement) || candidate === activeElement) {
        return false;
      }

      if (!container.contains(candidate) || !isVisible(candidate)) {
        return false;
      }

      return isNegativeLabel(getButtonLabel(candidate));
    });
  }

  function buildContext(button) {
    let current = button;
    let bestText = "";
    let depth = 0;

    while (current && depth < 6) {
      if (current instanceof HTMLElement) {
        const text = normalizeText(current.innerText || current.textContent);

        if (text && text.length <= 900 && text.length > bestText.length) {
          bestText = text;
        }

        if (CONTEXT_PATTERNS.some((pattern) => pattern.test(text))) {
          return text;
        }
      }

      current = current.parentElement;
      depth += 1;
    }

    return bestText;
  }

  function summarizeContext(context, label) {
    const stripped = normalizeText(context.replace(label, ""));

    if (!stripped) {
      return "Matching approval prompt detected on page.";
    }

    if (stripped.length <= 160) {
      return stripped;
    }

    return `${stripped.slice(0, 157)}...`;
  }

  function getFullContext(context, label) {
    const stripped = normalizeText(context.replace(label, ""));
    return stripped || normalizeText(context) || "Desktop Commander approval detected on page.";
  }

  function getContextText(button, container) {
    if (container instanceof HTMLElement) {
      return normalizeText(container.innerText || container.textContent);
    }

    return buildContext(button);
  }

  function getPromptCandidates() {
    const seen = new Set();
    const candidates = [];
    const interactiveCandidates = getInteractiveCandidates();

    interactiveCandidates.forEach((button) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }

      if (
        button.matches('[disabled], [aria-disabled="true"]') ||
        button.getAttribute("aria-disabled") === "true" ||
        !isVisible(button)
      ) {
        return;
      }

      const label = getButtonLabel(button);
      const approvalCard = getApprovalCard(button, interactiveCandidates);
      let labelScore = getLabelScore(label);

      if ((!label && !isPrimaryApprovalButton(button)) || isNegativeLabel(label) || isIgnoredLabel(label)) {
        return;
      }

      const dialogContainer = getDialogContainer(button, interactiveCandidates);

      const context = getContextText(button, dialogContainer);
      const contextScore = CONTEXT_PATTERNS.reduce((score, pattern) => {
        return score + (pattern.test(context) ? 2 : 0);
      }, 0);
      const inDialog = Boolean(dialogContainer);
      const hasNegativeSibling = hasNegativeSiblingAction(
        dialogContainer,
        button,
        interactiveCandidates
      );

      const isDesktopCommanderContext = DESKTOP_COMMANDER_PATTERN.test(context);

      if (!approvalCard && !isDesktopCommanderContext) {
        return;
      }

      if (!labelScore && isDesktopCommanderContext && (inDialog || hasNegativeSibling)) {
        labelScore = 3;
      }

      if (approvalCard && isPrimaryApprovalButton(button)) {
        labelScore = Math.max(labelScore, 9);
      }

      if (!labelScore) {
        return;
      }

      const labelAllowsInlineMatch = /^start process$/i.test(label) && isDesktopCommanderContext;

      if (!dialogContainer && !approvalCard && !labelAllowsInlineMatch) {
        return;
      }

      const totalScore =
        labelScore +
        contextScore +
        (inDialog ? 1 : 0) +
        (hasNegativeSibling ? 2 : 0) +
        (approvalCard ? 8 : 0);

      // Only the strongest known label is allowed without supporting context.
      if ((!labelAllowsInlineMatch && contextScore === 0 && !hasNegativeSibling) || totalScore < 5) {
        return;
      }

      const summary = summarizeContext(context, label);
      const message = getFullContext(context, label);
      const key = `${label}|${summary}`;

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      candidates.push({
        button,
        label,
        context: summary,
        message,
        score: totalScore
      });
    });

    return candidates.sort((left, right) => right.score - left.score);
  }

  function serializeCandidates(candidates) {
    return candidates.slice(0, 5).map((candidate, index) => ({
      id: `candidate-${index + 1}`,
      label: candidate.label,
      context: candidate.context,
      message: candidate.message,
      score: candidate.score
    }));
  }

  function getSnapshot(candidates = getPromptCandidates()) {
    return {
      ready: true,
      url: window.location.href,
      title: document.title,
      scannedAt: Date.now(),
      count: candidates.length,
      candidates: serializeCandidates(candidates)
    };
  }

  function getCandidateKey(candidate) {
    return `${candidate.label}|${candidate.context}`;
  }

  function cleanupAutoApproveCache() {
    const cutoff = Date.now() - AUTO_APPROVE_COOLDOWN_MS;

    for (const [key, createdAt] of state.autoApproveCache.entries()) {
      if (createdAt < cutoff) {
        state.autoApproveCache.delete(key);
      }
    }
  }

  function rememberApproval(candidate) {
    cleanupAutoApproveCache();
    state.autoApproveCache.set(getCandidateKey(candidate), Date.now());
  }

  function clearApprovalMemory(candidateKey) {
    if (candidateKey) {
      state.autoApproveCache.delete(candidateKey);
    }
  }

  function recordAutoApproval(candidate) {
    try {
      chrome.runtime.sendMessage({
        type: "AUTO_APPROVED",
        label: candidate.label,
        context: candidate.context,
        message: candidate.message,
        createdAt: Date.now()
      });
    } catch (error) {
      // Ignore runtime disconnects during page teardown.
    }
  }

  function findLiveCandidate(candidateKey) {
    const refreshedCandidates = getPromptCandidates();
    return {
      refreshedCandidates,
      liveCandidate:
        refreshedCandidates.find((candidate) => getCandidateKey(candidate) === candidateKey) ||
        refreshedCandidates[0] ||
        null
    };
  }

  function verifyAutoApproval(candidateKey, candidateSnapshot, attempt) {
    const { refreshedCandidates } = findLiveCandidate(candidateKey);
    const isStillPresent = refreshedCandidates.some((candidate) => getCandidateKey(candidate) === candidateKey);

    if (!isStillPresent) {
      recordAutoApproval(candidateSnapshot);
      scheduleSync(true);
      return;
    }

    if (attempt + 1 < AUTO_APPROVE_MAX_ATTEMPTS) {
      attemptAutoApproval(candidateKey, attempt + 1);
      return;
    }

    clearApprovalMemory(candidateKey);
    scheduleSync(true);
  }

  function attemptAutoApproval(candidateKey, attempt = 0) {
    const { liveCandidate } = findLiveCandidate(candidateKey);

    if (!liveCandidate) {
      clearApprovalMemory(candidateKey);
      scheduleSync(true);
      return;
    }

    const liveKey = getCandidateKey(liveCandidate);

    if (attempt === 0) {
      rememberApproval(liveCandidate);
    }

    flashCandidate(liveCandidate.button);

    if (!dispatchClick(liveCandidate.button)) {
      clearApprovalMemory(liveKey);
      scheduleSync(true);
      return;
    }

    window.setTimeout(() => {
      verifyAutoApproval(liveKey, liveCandidate, attempt);
    }, AUTO_APPROVE_VERIFY_MS);
  }

  function maybeAutoApprove(candidates) {
    window.clearTimeout(state.autoApproveTimer);

    if (!settings.autoApproveEnabled) {
      return;
    }

    const [topCandidate] = candidates;

    if (!topCandidate) {
      return;
    }

    cleanupAutoApproveCache();

    const candidateKey = getCandidateKey(topCandidate);

    if (state.autoApproveCache.has(candidateKey)) {
      return;
    }

    state.autoApproveTimer = window.setTimeout(() => {
      cleanupAutoApproveCache();

      if (state.autoApproveCache.has(candidateKey)) {
        return;
      }

      attemptAutoApproval(candidateKey);
    }, AUTO_APPROVE_DELAY_MS);
  }

  function syncState(force = false) {
    const candidates = getPromptCandidates();
    const snapshot = getSnapshot(candidates);
    const signature = JSON.stringify(snapshot.candidates);

    if (!force && signature === state.lastSignature) {
      return;
    }

    state.lastSignature = signature;
    maybeAutoApprove(candidates);

    try {
      chrome.runtime.sendMessage({
        type: "PROMPT_STATE",
        count: snapshot.count,
        candidates: snapshot.candidates
      });
    } catch (error) {
      // Ignore runtime disconnects during page teardown.
    }
  }

  function scheduleSync(force = false) {
    window.clearTimeout(state.broadcastTimer);
    state.broadcastTimer = window.setTimeout(() => syncState(force), force ? 0 : 140);
  }

  function ensureHighlightStyle() {
    if (state.styleInjected) {
      return;
    }

    const style = document.createElement("style");
    style.textContent = `
      @keyframes approvalConsolePulse {
        0% {
          box-shadow: 0 0 0 0 rgba(255, 149, 77, 0.6);
          transform: translateY(0);
        }
        50% {
          box-shadow: 0 0 0 10px rgba(255, 149, 77, 0);
          transform: translateY(-1px);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(255, 149, 77, 0);
          transform: translateY(0);
        }
      }

      .__approval-console-target {
        outline: 2px solid rgba(255, 149, 77, 0.95) !important;
        outline-offset: 3px !important;
        animation: approvalConsolePulse 1.2s ease-out 1;
      }
    `;
    document.documentElement.appendChild(style);
    state.styleInjected = true;
  }

  function flashCandidate(button) {
    ensureHighlightStyle();
    button.classList.add("__approval-console-target");
    window.setTimeout(() => {
      button.classList.remove("__approval-console-target");
    }, 1400);
  }

  function dispatchClick(button) {
    if (!(button instanceof HTMLElement) || !button.isConnected) {
      return false;
    }

    button.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: "auto"
    });

    const rect = button.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    try {
      button.focus({ preventScroll: true });
    } catch (error) {
      button.focus();
    }

    if (typeof button.click === "function") {
      button.click();
    }

    if (typeof window.PointerEvent === "function") {
      ["pointerdown", "pointerup"].forEach((type) => {
        button.dispatchEvent(new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          clientX,
          clientY,
          view: window
        }));
      });
    }

    ["mousedown", "mouseup", "click"].forEach((type) => {
      button.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX,
        clientY,
        view: window
      }));
    });

    ["Enter", " "].forEach((key) => {
      button.dispatchEvent(new KeyboardEvent("keydown", {
        key,
        code: key === "Enter" ? "Enter" : "Space",
        bubbles: true,
        cancelable: true,
        composed: true
      }));
      button.dispatchEvent(new KeyboardEvent("keyup", {
        key,
        code: key === "Enter" ? "Enter" : "Space",
        bubbles: true,
        cancelable: true,
        composed: true
      }));
    });

    return true;
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== "local") {
      return;
    }

    let hasSettingsChange = false;

    Object.keys(DEFAULT_SETTINGS).forEach((key) => {
      if (key in changes) {
        settings[key] = changes[key].newValue !== false;
        hasSettingsChange = true;
      }
    });

    if (hasSettingsChange) {
      if (!settings.autoApproveEnabled) {
        window.clearTimeout(state.autoApproveTimer);
      }

      scheduleSync(true);
    }
  }

  function handleWakeEvent() {
    scheduleSync(true);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") {
      return undefined;
    }

    if (message.type === "PING") {
      sendResponse({ ok: true, installed: true, version: INSTALL_VERSION });
      return undefined;
    }

    if (message.type === "REQUEST_STATE") {
      const snapshot = getSnapshot();
      sendResponse({ ok: true, ...snapshot });
      scheduleSync(true);
      return undefined;
    }

    return undefined;
  });

  const observer = new MutationObserver((mutations) => {
    const shouldSync = mutations.some((mutation) => {
      if (mutation.type === "childList") {
        return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
      }

      return mutation.target instanceof HTMLButtonElement;
    });

    if (shouldSync) {
      scheduleSync();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-disabled", "class", "disabled", "hidden", "style"]
  });

  chrome.storage.onChanged.addListener(handleStorageChange);
  document.addEventListener("visibilitychange", handleWakeEvent, true);
  window.addEventListener("focus", handleWakeEvent, true);
  window.addEventListener("pageshow", handleWakeEvent, true);
  state.heartbeatTimer = window.setInterval(() => {
    scheduleSync(document.visibilityState !== "visible");
  }, HEARTBEAT_SYNC_MS);

  window.__chatgptApprovalConsoleCleanup = () => {
    observer.disconnect();
    window.clearTimeout(state.broadcastTimer);
    window.clearTimeout(state.autoApproveTimer);
    window.clearInterval(state.heartbeatTimer);
    chrome.storage.onChanged.removeListener(handleStorageChange);
    document.removeEventListener("visibilitychange", handleWakeEvent, true);
    window.removeEventListener("focus", handleWakeEvent, true);
    window.removeEventListener("pageshow", handleWakeEvent, true);
  };

  void loadSettings().finally(() => scheduleSync(true));
})();
