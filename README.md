# Borderlands Loot Tracker

A personal, browser-based checklist for Borderlands loot, with a Lootlemon catalog sync pipeline.

## Current scope

- Borderlands 1, Borderlands 2, Borderlands: The Pre-Sequel, Borderlands 3, Tiny Tina's Wonderlands, Borderlands 4.
- Tales from the Borderlands and New Tales from the Borderlands are intentionally excluded: they do not have collectible gear catalogs.
- Collection progress is stored separately from the source catalog.
- Catalog sync is additive: newly discovered items are added; missing source entries are archived, never silently deleted.
- Before sync, the workflow snapshots the current catalog and metadata. The UI also supports local JSON export/import.

## Run locally

Open `index.html` in a browser. No build step is required.

## Catalog synchronization

The GitHub Actions workflow runs the scraper daily and can also be started manually. It reads Lootlemon database pages, extracts item links and available metadata, and updates `data/catalog.json`.

The scraper is deliberately conservative: it only adds records it can identify, retains existing records when a page cannot be parsed, and writes a sync report. Lootlemon markup changes may require parser updates. Review the generated diff after the first run.

## Backups

Before catalog updates, the workflow commits a timestamped snapshot under `backups/`. Keep the most recent 30 snapshots. Browser collection progress is private to the browser unless exported by the user; it is never overwritten by catalog synchronization.

## Data source

Catalog metadata and item links are sourced from [Lootlemon](https://www.lootlemon.com/). Images are referenced by their original source URL rather than copied into this repository.

## Project status

The initial application and sync framework are being established. Catalog completeness and parser coverage for each game/category must be validated against Lootlemon before calling the tracker complete.
