# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A web-based Eisenhower Matrix task manager with Supabase backend for cross-machine sync. No build tools, no bundler, no framework. Pure vanilla HTML/CSS/JS with ES modules.

## Running Locally

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. ES modules require a server; `file://` won't work.

## Architecture

Four files, all ES modules loaded via `<script type="module">`:

- **supabase.js** - Supabase client init (CDN import), all DB operations (CRUD, reorder, realtime subscription). Every other module imports from here.
- **auth.js** - Magic link auth flow, session management, view toggling between auth and app. Imports `supabase` client and `initApp` from app.js.
- **app.js** - All UI logic: rendering quadrants, task cards, drag-and-drop, inline editing, detail panel (description, status, due date, links), archive view, and realtime event handling. This is the largest file and the main entry point after auth.
- **style.css** - Dark theme, CSS grid for 2x2 matrix layout, detail slide-out panel, archive view, status badge colors.

Module dependency: `supabase.js` <- `auth.js` <- `app.js` (auth imports initApp from app).

## Supabase Schema

Single `tasks` table with RLS (row-level security) scoped to `auth.uid()`:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | auto-generated |
| user_id | uuid FK | default auth.uid(), RLS-filtered |
| title | text | required |
| description | text | nullable |
| status | text | check constraint: todo, in_progress, done, paused, cancelled |
| quadrant | smallint | 1=Do, 2=Schedule, 3=Delegate, 4=Eliminate |
| sort_order | integer | ordering within a quadrant |
| due_date | date | nullable |
| links | jsonb | array of {label, url} objects, default '[]' |
| archived_at | timestamptz | null = active, set = archived |
| created_at | timestamptz | auto |
| updated_at | timestamptz | auto via trigger |

Realtime replication must be enabled on the tasks table in Supabase dashboard.

## Key Patterns

- **No build step.** Supabase JS client is loaded via CDN ESM import (`import()` in supabase.js). All inter-file dependencies use native ES module imports.
- **Optimistic UI.** Local state is updated before DB writes resolve. Realtime events handle sync from other clients but skip duplicates already applied locally.
- **Debounced saves.** Text fields in the detail panel auto-save with 500ms debounce. Dropdowns (status, date) save immediately.
- **Drag-and-drop.** Uses native HTML drag API. On drop, all tasks in the target quadrant get their `sort_order` reassigned and batch-updated.
- **Archive is a soft filter.** `archived_at` being non-null hides tasks from quadrants. Archive view shows them sorted by archive date. Unarchive sets it back to null.
