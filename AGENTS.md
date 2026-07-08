# AGENTS.md

A shared reservation calendar (Spanish UI, Liquid Glass aesthetic) for a family apartment in Chillán, Chile. Five families, each a fixed color.

## Stack (intentional, do not change)

- Vanilla JS, **no build step, no package.json, no bundler, no test runner, no linter**.
- Three files: `index.html`, `styles.css`, `app.js`.
- Static assets: `assets/chillan-bg.jpg` (desktop 1.3 MB) and `assets/chillan-bg-mobile.jpg` (mobile 330 KB, loaded `<900px`). Both must ship on deploy.
- PWA: `manifest.webmanifest`, `icon-192.png`, `icon-512.png`.
