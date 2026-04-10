---
title: "I Built a Chrome Extension That Auto-Approves Desktop Commander Prompts in ChatGPT"
published: true
description: "Stop babysitting your AI agent. Desktop Commander Auto Approver watches for permission prompts in ChatGPT and clicks 'Approve' for you automatically."
tags: chrome-extension, chatgpt, automation, javascript
cover_image: 
canonical_url: https://github.com/Idevelopusefulstuff/desktop-commander-auto-approver
---

## The Problem

If you use [Desktop Commander](https://chatgpt.com) or similar tool-use plugins in ChatGPT, you know the pain: every single action requires you to manually click "Approve" or "Allow" or "Set C:\Temp" or whatever the confirmation button says. You're sitting there watching your AI agent do its thing, and every 10 seconds it stops and waits for you to click a button.

It kills the flow. It defeats the purpose of an *autonomous* agent.

## The Solution

I built **Desktop Commander Auto Approver** -- a Chrome Manifest V3 extension that continuously watches the ChatGPT DOM for Desktop Commander approval cards and clicks the affirmative action automatically.

No popup interaction needed. No manual approval. It just works.

## How It Works

The extension injects a content script into `chatgpt.com` that:

1. **Watches the DOM** via MutationObserver for new approval cards
2. **Scores candidate buttons** using a weighted pattern matcher:
   - Positive signals: "Start Process", "Approve", "Allow", "Run Tool", "Confirm", "Set ..." etc.
   - Negative signals: "Deny", "Cancel", "Reject", "Block"
   - Ignored: "Share", "Copy", "Edit", "Retry" (normal chat UI buttons)
3. **Detects Desktop Commander context** using regex against the surrounding card text
4. **Auto-clicks** the highest-scoring affirmative button with a short delay and verification pass
5. **Logs the approval** to local storage so you can review what was auto-approved later

### Click Path

The click routine doesn't just fire a `.click()`. It uses a multi-layer approach:

```javascript
el.focus();
el.click();
el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
```

This handles React's synthetic event system and any other framework-level interception that would swallow a bare `.click()`.

### Cooldown & Safety

- **180ms delay** before clicking (lets the UI settle)
- **420ms verification** after the click to confirm it worked
- **6-second cooldown** per approval to prevent double-fires
- **Max 3 attempts** per candidate before giving up

## The Popup

Even though auto-approve runs headlessly, there's a full popup UI:

- **Live detection count** with badge
- **Toggle switches** for auto-approve, badge count, and history logging
- **Approval history** with relative timestamps

The popup is dark-themed with an orange accent, and the hero section pulses subtly when the extension is active.

## Installation

1. Clone the repo:
```bash
git clone https://github.com/Idevelopusefulstuff/desktop-commander-auto-approver.git
```

2. Open `chrome://extensions` in Chrome

3. Enable **Developer mode** (top right toggle)

4. Click **Load unpacked** and select the cloned folder

5. Open ChatGPT and trigger a Desktop Commander action -- it should auto-approve without you touching anything

## What I Learned

- ChatGPT's DOM is heavily framework-managed with React. Bare `.click()` calls often get swallowed. The multi-event dispatch pattern is necessary.
- MutationObserver is the right tool here, not polling. ChatGPT dynamically injects approval cards, and the observer catches them within milliseconds.
- Button text matching needs to be fuzzy. Desktop Commander uses custom labels like "Set C:\Temp" rather than generic "Approve" buttons.
- Cooldowns are essential. Without them, the observer fires multiple times for the same DOM mutation and you get double-clicks.

## Source Code

Full source on GitHub: [Idevelopusefulstuff/desktop-commander-auto-approver](https://github.com/Idevelopusefulstuff/desktop-commander-auto-approver)

MIT licensed. PRs welcome.

---

*Built with frustration and JavaScript.*
