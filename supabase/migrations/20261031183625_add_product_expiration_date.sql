-- Store a product expiration date. Only the product form enforces this for medicines.
alter table public.products add column if not exists expiration_date date;
