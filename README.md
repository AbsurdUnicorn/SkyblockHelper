# SkyBlock Helper

A Windows desktop app that tracks Hypixel SkyBlock progress: skills, collections, pets, museum, accessories, slayers, dungeons, mining and foraging, the Rift, shards, money making, and shopping plans.

## Install

Download `SkyBlock-Helper-Setup-x.y.z.exe` from the [latest release](https://github.com/AbsurdUnicorn/SkyblockHelper/releases/latest) and run it. It installs for your Windows user and adds a desktop and Start-menu shortcut.

The installer isn't code-signed, so Windows SmartScreen may say it "protected your PC". Click **More info → Run anyway**.

Open the app, enter your Minecraft username and your own Hypixel API key, and press **Load**. The key is stored only on your PC and sent only to `api.hypixel.net`. Press **Demo data** to look around without a key.

## Updates

The app checks for a new version when it starts (and every 6 hours while open), downloads it in the background, and asks you to restart. **App → Check for updates** checks right away.

## Publishing a new version (maintainer)

1. Make your changes to `index.html`.
2. Run `npm run release` (or `npm run release -- 1.2.0` for a specific version).

That bumps the version, builds the installer, commits, and uploads it to a GitHub Release. Every installed copy picks it up. It needs Node.js and the GitHub CLI signed in; it doesn't use GitHub Actions.

To try changes without releasing: `npm start`.

## Data sources

Hypixel API, the NotEnoughUpdates repo, SkyShards (MIT), live Bazaar and lowest-BIN prices, and the Hypixel SkyBlock wiki and community guides.
