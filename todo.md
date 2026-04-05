# Хронос — TODO

## Database & Backend
- [x] MySQL/TiDB schema: time_entries, tags tables (Drizzle ORM)
- [x] Generate & apply migrations
- [x] DB helpers: upsertEntry, getEntriesByRange, bulkUpsert, deleteEntry
- [x] tRPC routers: entries (get/upsert/bulkUpsert/delete), tags (list/create/update)
- [x] Default tags seeded on first login (12 Russian tags)

## Frontend — Time Tracking Page
- [x] Week grid layout: 53 weeks of 2026, horizontal wrap
- [x] Each week table: 7 days × 96 blocks (00:00–23:45 in 15-min steps)
- [x] Tag dropdown per block (predefined Russian tags + custom)
- [x] Color-coded tag visualization
- [x] Auto-save on tag selection
- [x] Bulk tag assignment (drag range to fill multiple blocks)

## Frontend — Analytics Page
- [x] Weekly filter + summary table (hours/min + %)
- [x] Top-5 most used tags for selected week
- [x] Pie chart for weekly distribution
- [x] Monthly analytics view with bar chart
- [x] Yearly analytics view with line trend chart

## Deployment
- [x] Dockerfile for Railway (pnpm, node:22-alpine)
- [x] railway.json with DOCKERFILE builder + pre-deploy migrate
- [x] migrate.mjs (drizzle-orm/migrator direct call)
- [x] Replace Manus OAuth with Google OAuth (server/_core/oauth.ts)
- [x] server/_core/env.ts — add googleClientId/googleClientSecret
- [x] client/src/const.ts — getLoginUrl() supports both Manus and Google OAuth
- [x] DEPLOY.md — step-by-step Railway deployment guide

## Design & UX
- [x] Dark minimal theme (slate/zinc palette, OKLCH colors)
- [x] DashboardLayout with sidebar (Учёт времени / Аналитика)
- [x] LoginPage with Хронос branding
- [x] Vitest tests for routers (10 tests passing)
