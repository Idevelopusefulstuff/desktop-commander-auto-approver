# Desktop Commander Auto Approver

Production Chrome extension for ChatGPT that watches for Desktop Commander approval cards and clicks the affirmative action automatically.

Built by `IDevUsefulStuff`.

## What it does

- Detects Desktop Commander approval cards structurally instead of relying on changing prompt copy.
- Auto-approves matching cards when `Auto-approve` is enabled.
- Shows a badge count for live detections when `Badge count` is enabled.
- Stores recent approvals locally when `Approval history` is enabled.
- Provides a compact popup for status, manual fallback approval, settings, and history cleanup.

## Settings

- `Auto-approve`: enables silent approval of matching Desktop Commander cards.
- `Badge count`: shows the current detection count on the extension icon.
- `Approval history`: keeps a recent local record of approved prompts.
- `Reset`: restores all settings to production defaults.
- `Clear all`: clears the saved approval history.

## Installation

1. Open Chrome and go to `chrome://extensions/`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the `auto-approve-chatgpt` folder.
5. If ChatGPT was already open, reload that tab once and then click `Refresh scan` in the popup.

## Usage

1. Open ChatGPT on `chatgpt.com` or `chat.openai.com`.
2. Leave `Auto-approve` enabled for hands-off approval.
3. If needed, open the popup to confirm live detections, settings, and recent approvals.
4. Use `Clear all` to wipe the local approval log.

## Notes

- The extension is intentionally scoped to Desktop Commander approval surfaces in ChatGPT.
- It does not touch unrelated ChatGPT UI actions.
- If the scanner is not ready after updating the extension, refresh the ChatGPT tab once.
