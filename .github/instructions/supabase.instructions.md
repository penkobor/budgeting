---
description: "Supabase database workflow: applying migrations, querying, RLS conventions. Use when: creating/modifying tables, writing migrations, running SQL against remote DB."
applyTo: "supabase/**,src/lib/db.types.ts,src/hooks/**"
---

# Supabase Database Workflow

## Project Info

| Key | Value |
|-----|-------|
| Project ref | `xowbsqjkipknpxarynzu` |
| URL | `https://xowbsqjkipknpxarynzu.supabase.co` |
| Env var for token | `SUPABASE_ACCESS_TOKEN` |

## Applying Migrations

> **⚠️ `supabase db push` is broken for this repo** — multiple migration files share the same date prefix (e.g. `20260427_*`), causing PK collisions in `schema_migrations`.

### Use the Management API instead:

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/xowbsqjkipknpxarynzu/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rs '{query: .}' < supabase/migrations/<FILE>.sql)"
```

- Empty `[]` response = success (no rows returned).
- Error response = JSON with `message` field.
- Always ask the user for `SUPABASE_ACCESS_TOKEN` if not in environment.

### Creating New Migrations

1. Create file: `supabase/migrations/<YYYYMMDD>_<description>.sql`
2. Use a **unique date prefix** — check existing files first to avoid collisions.
3. Always include `create table if not exists` for idempotency.
4. Always add RLS policies (see conventions below).
5. Add corresponding types to `src/lib/db.types.ts` (Row, Insert, Update + convenience aliases at bottom).
6. Apply via Management API (see above).

## RLS Conventions

Every table gets these four policies:

```sql
alter table public.<table> enable row level security;

create policy "Users can read own <table>"
  on public.<table> for select using (auth.uid() = user_id);

create policy "Users can insert own <table>"
  on public.<table> for insert with check (auth.uid() = user_id);

create policy "Users can update own <table>"
  on public.<table> for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete own <table>"
  on public.<table> for delete using (auth.uid() = user_id);
```

## Type Conventions

In `src/lib/db.types.ts`:
- Table definition goes inside `Database > public > Tables > <table_name>`
- Convenience aliases at the bottom: `export type Foo = Database['public']['Tables']['foo']['Row']`
- Insert/Update types also aliased if used in hooks.

## Query Hook Conventions

In `src/hooks/`:
- One file per domain (e.g. `queries.ts`, `share.ts`, `meal-preferences.ts`)
- Use TanStack Query (`useQuery` / `useMutation`)
- Query keys: `['table_name', ...params]`
- Always invalidate related queries on mutation success.
