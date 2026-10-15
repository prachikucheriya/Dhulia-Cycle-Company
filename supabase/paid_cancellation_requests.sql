create table if not exists public.paid_cancellation_requests (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id),
 item_id uuid not null references public.order_items(id),
 customer_id uuid not null references auth.users(id),
 quantity integer not null check(quantity>0),
 status text not null default 'pending' check(status in ('pending','approved','rejected','refunded')),
 created_at timestamptz not null default now()
);
create index if not exists paid_cancellation_requests_order_idx on public.paid_cancellation_requests(order_id);
alter table public.paid_cancellation_requests enable row level security;
-- Requests are written only by the authenticated server after ownership and item checks.
