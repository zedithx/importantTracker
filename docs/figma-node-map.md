# SnapRecall Figma Node Map (awpLACxG0TdX3YydNwEqrB)

Last verified: 2026-03-11

## Canonical root frames
- Login flow container: `1:3`
- Telegram setup (Step 2 / verification state): `1:104`
- Telegram setup (Step 1 / open bot state): `1:201`
- Main app shell container: `1:1598`

## Important child nodes
- Sidebar: `1:1599`
- Navigation group: `1:1637`
- Main app area: `1:1673`
- History view content: `1:1675`
- Telegram status strip (sidebar footer): `1:1668`

## Login flow nodes
- Window chrome: `1:4`
- Login screen content wrapper: `1:28`

## Telegram flow nodes
- Step 1 card (open bot): `1:257` (under root `1:201`)
- Step 2 card (verification): `1:168` (under root `1:104`)

## Notes
- Earlier IDs used in implementation (for example `1:2`, `1:103`, `1:200`) are no longer the canonical root nodes after frame cleanup.
- Current implementation should reference the roots above for future redesign iterations.
