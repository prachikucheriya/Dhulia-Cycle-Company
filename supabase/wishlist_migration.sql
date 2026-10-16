-- Run once in Supabase SQL Editor before deploying the account-wise wishlist UI.
create table if not exists public.wishlists (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.wishlists enable row level security;
drop policy if exists "wishlist owner select" on public.wishlists;
drop policy if exists "wishlist owner insert" on public.wishlists;
drop policy if exists "wishlist owner delete" on public.wishlists;
create policy "wishlist owner select" on public.wishlists for select to authenticated using ((select auth.uid()) = user_id);
create policy "wishlist owner insert" on public.wishlists for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "wishlist owner delete" on public.wishlists for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, delete on public.wishlists to authenticated;
revoke all on public.wishlists from anon;
