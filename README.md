# ChatGPT Auto Approve

Chrome extension that automatically detects and approves tool permission prompts in ChatGPT — Desktop Commander, MCP servers, browser tools, code interpreter, and any other tool that asks for your approval.

Built by `IDevUsefulStuff`.

## What it does

- Detects tool approval prompts structurally (primary/secondary button pairs in dialog-like containers).
- Matches context patterns for Desktop Commander, MCP servers, browser tools, code execution, file access, and general permission language.
- Auto-approves matching prompts when `Auto-approve` is enabled — no popup interaction needed.
- Shows a badge count for live detections when `Badge count` is enabled.
- Stores recent approvals locally when `Approval history` is enabled.
- Provides a compact popup for status, settings, and history.

## Supported tools

Works with any ChatGPT tool that presents an approval dialog, including but not limited to:

- Desktop Commander
- MCP servers (any)
- Browser tools
- Code interpreter / code execution
- File system access prompts
- Any plugin or connector that asks "Allow", "Approve", "Confirm", or similar

## Settings

- **Auto-approve**: enables silent approval of matching tool permission prompts.
- **Badge count**: shows the current detection count on the extension icon.
- **Approval history**: keeps a recent local record of approved prompts.
- **Clear all**: clears the saved approval history.

## Installation

1. Clone the repo:
   ```bash
   git clone https://github.com/Idevelopusefulstuff/chatgpt-auto-approve.git
   ```
2. Open Chrome and go to `chrome://extensions/`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the cloned folder.
6. If ChatGPT was already open, reload that tab once.

## Usage

1. Open ChatGPT on `chatgpt.com` or `chat.openai.com`.
2. Leave `Auto-approve` enabled for hands-off approval.
3. Trigger any tool action that requires permission — it gets approved automatically.
4. Open the popup to check live detections, settings, and recent approvals if needed.

## Notes

- The extension only runs on ChatGPT pages (`chatgpt.com` and `chat.openai.com`).
- It ignores normal chat UI buttons (Share, Copy, Edit, Retry, etc.).
- It uses structural detection (button pairs + context) rather than brittle text matching.
