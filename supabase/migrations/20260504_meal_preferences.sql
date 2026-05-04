-- Meal planning preferences (persisted per user for LLM export wizard)
create table if not exists public.meal_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),

  -- Step 1: Eating pattern
  meals_breakfast boolean not null default false,
  meals_lunch boolean not null default true,
  meals_dinner boolean not null default true,
  meals_snacks boolean not null default true,
  snacks_count smallint not null default 2,
  eating_notes text,

  -- Step 2: Food preferences
  diet_type text not null default 'omnivore', -- omnivore, vegetarian, vegan, keto, custom
  foods_love text,
  foods_avoid text,
  cuisines text[] not null default '{}', -- e.g. {'czech','asian','italian'}

  -- Step 3: Body & nutrition
  calc_mode text not null default 'manual', -- 'manual' | 'auto'
  sex text, -- 'male' | 'female'
  age smallint,
  height_cm smallint,
  weight_kg numeric(5,1),
  activity_level text not null default 'moderate', -- sedentary, light, moderate, active, very_active
  goal text not null default 'maintain', -- lose, maintain, gain
  calories smallint,
  protein_g smallint,
  fat_g smallint,
  carbs_g smallint,

  -- Step 4: Shopping context
  stores text[] not null default '{Albert,Billa,Lidl}',
  food_budget_amount numeric(10,2),
  food_budget_period text not null default 'week', -- 'week' | 'month'
  shopping_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.meal_preferences enable row level security;

create policy "Users can read own meal_preferences"
  on public.meal_preferences for select
  using (auth.uid() = user_id);

create policy "Users can insert own meal_preferences"
  on public.meal_preferences for insert
  with check (auth.uid() = user_id);

create policy "Users can update own meal_preferences"
  on public.meal_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own meal_preferences"
  on public.meal_preferences for delete
  using (auth.uid() = user_id);
