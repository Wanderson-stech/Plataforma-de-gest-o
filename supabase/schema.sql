-- Orbe MVP: shared inventory. Every authenticated user can read and manage
-- the same products. Run this only in the Supabase project selected for Orbe.
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  category text not null check (char_length(trim(category)) between 1 and 60),
  quantity integer not null default 0 check (quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;

drop policy if exists "Authenticated users can view shared products" on public.products;
create policy "Authenticated users can view shared products"
  on public.products for select to authenticated using (true);

drop policy if exists "Authenticated users can add shared products" on public.products;
create policy "Authenticated users can add shared products"
  on public.products for insert to authenticated with check (true);

drop policy if exists "Authenticated users can update shared products" on public.products;
create policy "Authenticated users can update shared products"
  on public.products for update to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can delete shared products" on public.products;
create policy "Authenticated users can delete shared products"
  on public.products for delete to authenticated using (true);

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
