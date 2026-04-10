---
title: "I Built a Chrome Extension That Auto-Approves Tool Prompts in ChatGPT"
published: true
description: "Stop clicking Approve every 10 seconds. This extension watches for any tool permission prompt in ChatGPT and clicks it for you — Desktop Commander, MCP servers, browser tools, all of them."
tags: chrome-extension, chatgpt, automation, javascript
cover_image: 
canonical_url: https://github.com/Idevelopusefulstuff/chatgpt-auto-approve
---

## The Problem

ChatGPT's tool-use ecosystem is growing fast. Desktop Commander, MCP servers, browser tools, code interpreter actions — they all share one annoying pattern: every action requires you to manually click "Approve", "Allow", "Start Process", or whatever the confirmation button says.

You're sitting there watching your AI agent work, and every 10 seconds it stops dead and waits for you to click a button. It kills the flow. It defeats the whole point of an autonomous agent.

## The Solution

I built **ChatGPT Auto Approve** — a Chrome Manifest V3 extension that continuously watches the ChatGPT DOM for tool approval prompts and clicks the affirmative action automatically.

No popup interaction needed. No manual approval. It works with **any** tool that presents a permission dialog in ChatGPT.

## What It Catches

The extension uses structural detection rather than brittle text matching. It looks for:

- **Button pairs**: A primary action button ("Approve", "Allow", "Start Process", "Set ...", "Confirm") paired with a negative button ("Deny", "Cancel", "Block")
- **Dialog containers**: `[role="dialog"]`, Radix portals, or small card-like containers with limited button count
- **Context signals**: Pattern matching against 20+ phrases like "using tools comes with risks", "wants to use", "permission required", "MCP server", "execute code", "file access", etc.

This means it works with:
- Desktop Commander
- Any MCP server
- Browser tools
- Code interpreter / execution prompts
- File system access dialogs
- Any future ChatGPT plugin that follows the same approval pattern

## How It Works Under the Hood

The content script injects into `chatgpt.com` and:

1. **Watches the DOM** via `MutationObserver` for added/removed nodes
2. **Scans all interactive elements** (`button`, `[role="button"]`, `input[type="submit"]`)
3. **Scores each candidate** using a weighted pattern system
4. **Finds the approval container** by walking up the DOM looking for structural signals
5. **Auto-clicks** the highest-scoring candidate with a multi-event dispatch

### The Click Path

A bare `.click()` gets swallowed by React's synthetic event system. The extension uses a multi-layer approach:

```javascript
el.focus();
el.click();
el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
// Plus keyboard events as fallback
```

### Safety Rails

- **180ms delay** before clicking (lets the UI settle)
- **420ms verification** after the click to confirm it worked
- **6-second cooldown** per approval to prevent double-fires
- **Max 3 attempts** per candidate before giving up
- **Ignored buttons**: Share, Copy, Edit, Retry, Regenerate, Read Aloud, thumbs up/down — normal chat UI is never touched

## The Popup

Even though auto-approve runs headlessly, there's a full popup UI with:

- **Live detection count** with badge on the extension icon
- **Toggle switches** for auto-approve, badge count, and history logging
- **Approval history** with relative timestamps ("Just now", "5 min ago", etc.)
- Dark theme with orange accent

## Installation

```bash
git clone https://github.com/Idevelopusefulstuff/chatgpt-auto-approve.git
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the cloned folder
4. Open ChatGPT and trigger any tool action — it auto-approves

## Source Code

Full source on GitHub: [Idevelopusefulstuff/chatgpt-auto-approve](https://github.com/Idevelopusefulstuff/chatgpt-auto-approve)

MIT licensed. PRs welcome.

---

*Built because clicking "Approve" 47 times per session is not a workflow.*
