# Eisenhower Matrix

A web-based Eisenhower Matrix task manager with Supabase backend for cross-machine sync.

No build tools, no framework. Vanilla HTML/CSS/JS with ES modules.

## Features

- Four-quadrant grid: Do, Schedule, Delegate, Eliminate
- Drag-and-drop tasks between quadrants and reorder within
- Task detail panel with description, due date, links, and status tracking
- Statuses: Todo, In Progress, Done, Paused, Cancelled
- Archive for completed/cold tasks with unarchive support
- Magic link authentication (email)
- Realtime sync across devices via Supabase

## Setup

### 1. Supabase project

Create a Supabase project at [supabase.com](https://supabase.com). Then run the following SQL in the SQL Editor.

#### Create the tasks table

```sql
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  description text,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'cancelled', 'paused')),
  quadrant smallint not null check (quadrant between 1 and 4),
  sort_order integer not null default 0,
  due_date date,
  links jsonb default '[]'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_user_quadrant_idx on public.tasks (user_id, quadrant, sort_order);
create index tasks_user_archived_idx on public.tasks (user_id, archived_at);
```

#### Row-level security

```sql
alter table public.tasks enable row level security;

create policy "Users can view own tasks"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "Users can insert own tasks"
  on public.tasks for insert
  with check (auth.uid() = user_id);

create policy "Users can update own tasks"
  on public.tasks for update
  using (auth.uid() = user_id);

create policy "Users can delete own tasks"
  on public.tasks for delete
  using (auth.uid() = user_id);
```

#### Auto-update timestamp trigger

```sql
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();
```

#### Enable realtime

In the Supabase dashboard, go to **Database > Replication** and enable replication for the `tasks` table.

### 2. Configure the app

Config lives in `config.js` (gitignored). Create it one of two ways, using the
values from Supabase Dashboard > Settings > API:

```bash
# Option A: copy the template and edit
cp config.example.js config.js

# Option B: generate it from env vars
SUPABASE_URL='https://your-project.supabase.co' \
SUPABASE_ANON_KEY='your-anon-key' \
node generate-config.mjs
```

The anon (publishable) key is meant to ship to the browser; row-level security
on the `tasks` table is the real access boundary, not this key.

### 3. Run locally

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`. ES modules require a server; `file://` won't work.

### 4. Authentication

The app uses Supabase magic link (email OTP). Enter your email, click the link in your inbox, and you're in. Sessions persist via refresh tokens.

## Deploy to Cloudflare Pages

1. Push this repo to GitHub.
2. In Cloudflare: **Workers & Pages > Create > Pages > Connect to Git**, pick the repo.
3. Build settings: framework preset **None**, build command `node generate-config.mjs`,
   output directory `/`.
4. Add environment variables `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Production, and
   Preview if you use preview deploys).
5. In Supabase **Authentication > URL Configuration**, set the Site URL to your Pages
   URL and add it to the redirect allow-list, so magic links redirect back correctly.

## Quadrant mapping

| Quadrant | Label | Meaning |
|----------|-------|---------|
| 1 | Do | Urgent and Important |
| 2 | Schedule | Important, not urgent |
| 3 | Delegate | Urgent, not important |
| 4 | Eliminate | Neither |
