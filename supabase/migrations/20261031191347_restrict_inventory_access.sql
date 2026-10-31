-- Restrict the shared stock to accounts explicitly authorized at rollout.
-- Existing accounts are preserved; later accounts need an explicit access row.
create table if not exists public.inventory_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.inventory_access enable row level security;
revoke all on public.inventory_access from public, anon, authenticated;
grant select on public.inventory_access to authenticated;

drop policy if exists "Users can confirm their own inventory access" on public.inventory_access;
create policy "Users can confirm their own inventory access"
  on public.inventory_access for select to authenticated
  using (user_id = (select auth.uid()));

insert into public.inventory_access (user_id)
select id from auth.users
on conflict (user_id) do nothing;

drop policy if exists "Authenticated users can view shared products" on public.products;
drop policy if exists "Authenticated users can add shared products" on public.products;
drop policy if exists "Authenticated users can update shared products" on public.products;
drop policy if exists "Authenticated users can delete shared products" on public.products;
drop policy if exists "Authorized users can view shared products" on public.products;
drop policy if exists "Authorized users can add shared products" on public.products;
drop policy if exists "Authorized users can update shared products" on public.products;
drop policy if exists "Authorized users can delete shared products" on public.products;

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
