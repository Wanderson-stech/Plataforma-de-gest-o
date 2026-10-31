-- Orbe MVP: shared inventory with explicit account authorization.
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  category text not null check (char_length(trim(category)) between 1 and 60),
  quantity integer not null default 0 check (quantity >= 0),
  expiration_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;

create table if not exists public.inventory_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.inventory_access enable row level security;
revoke all on public.inventory_access from public, anon, authenticated;
grant select on public.inventory_access to authenticated;

create policy "Users can confirm their own inventory access"
  on public.inventory_access for select to authenticated
  using (user_id = (select auth.uid()));

-- Preserves accounts that already exist when this schema is applied.
insert into public.inventory_access (user_id)
select id from auth.users
on conflict (user_id) do nothing;

drop policy if exists "Authenticated users can view shared products" on public.products;
drop policy if exists "Authenticated users can add shared products" on public.products;
drop policy if exists "Authenticated users can update shared products" on public.products;
drop policy if exists "Authenticated users can delete shared products" on public.products;

create policy "Authorized users can view shared products"
  on public.products for select to authenticated
  using (exists (select 1 from public.inventory_access a where a.user_id = (select auth.uid())));
create policy "Authorized users can add shared products"
  on public.products for insert to authenticated
  with check (exists (select 1 from public.inventory_access a where a.user_id = (select auth.uid())));
create policy "Authorized users can update shared products"
  on public.products for update to authenticated
  using (exists (select 1 from public.inventory_access a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.inventory_access a where a.user_id = (select auth.uid())));
create policy "Authorized users can delete shared products"
  on public.products for delete to authenticated
  using (exists (select 1 from public.inventory_access a where a.user_id = (select auth.uid())));

grant select, insert, update, delete on public.products to authenticated;
revoke all on public.products from anon;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
end $$;

-- To grant a new account access, create it in Supabase Auth and insert its UUID
-- into public.inventory_access using the SQL Editor. New accounts are not trusted by default.
