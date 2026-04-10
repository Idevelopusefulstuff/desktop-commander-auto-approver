#!/bin/bash
# Run all steps: kill PS, save clipboard screenshot, git push, update Dev.to
set -e

cd "C:/Users/Scott/PycharmProjects/wsbot/CakesAI/auto-approve-chatgpt"

echo "=== Step 1: Kill hung PowerShell ==="
taskkill /F /IM powershell.exe 2>/dev/null || echo "No powershell to kill"

echo "=== Step 2: Save clipboard screenshot ==="
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; \$img = [System.Windows.Forms.Clipboard]::GetImage(); if (\$img) { \$img.Save('C:\\Users\\Scott\\PycharmProjects\\wsbot\\CakesAI\\auto-approve-chatgpt\\screenshot.png'); 'saved' } else { 'no-image-on-clipboard' }"

echo "=== Step 3: Git commit and push ==="
git add screenshot.png DEVTO_ARTICLE.md
git commit -m "Add popup screenshot and update article cover image"
git push origin main

echo "=== Step 4: Update Dev.to article ==="
node update-devto.js

echo "=== Done ==="
