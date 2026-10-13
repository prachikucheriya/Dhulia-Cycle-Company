-- Run in Supabase SQL Editor. Admin access is assigned manually to a trusted user.
create extension if not exists pgcrypto;
create table if not exists public.profiles(id uuid primary key references auth.users(id) on delete cascade,email text,full_name text,role text not null default 'customer' check(role in ('customer','admin')),created_at timestamptz default now());
create table if not exists public.products(id uuid primary key default gen_random_uuid(),name text not null,description text default '',category text not null default 'Cycles',price numeric(12,2) not null check(price>=0),compare_at numeric(12,2),stock integer not null default 0 check(stock>=0),image_url text,sku text unique,featured boolean default false,active boolean default true,created_at timestamptz default now());
create table if not exists public.orders(id uuid primary key default gen_random_uuid(),order_number text unique not null,customer_id uuid references auth.users(id) on delete set null,customer_name text not null,email text not null,phone text not null,address jsonb not null,subtotal numeric(12,2) not null,shipping numeric(12,2) not null,tax numeric(12,2) not null default 0,total numeric(12,2) not null,payment_method text not null default 'COD',payment_status text not null default 'pending',status text not null default 'placed',notes text default '',courier text,tracking_number text,tracking_url text,dispatched_at timestamptz,delivered_at timestamptz,created_at timestamptz default now());
create table if not exists public.order_items(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id) on delete cascade,product_id uuid references public.products(id) on delete set null,name text not null,sku text,price numeric(12,2) not null,quantity integer not null check(quantity>0),line_total numeric(12,2) not null);
create index if not exists idx_orders_customer on public.orders(customer_id);create index if not exists idx_orders_created on public.orders(created_at desc);
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin')$$;
alter table public.profiles enable row level security;alter table public.products enable row level security;alter table public.orders enable row level security;alter table public.order_items enable row level security;
create policy "profiles own read" on public.profiles for select to authenticated using(id=(select auth.uid()) or public.is_admin());
create policy "profiles own insert" on public.profiles for insert to authenticated with check(id=(select auth.uid()) and role='customer');
create policy "profiles own update" on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()) and role='customer');
create policy "products public read" on public.products for select to anon,authenticated using(active=true or public.is_admin());
create policy "products admin insert" on public.products for insert to authenticated with check(public.is_admin());
create policy "products admin update" on public.products for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "products admin delete" on public.products for delete to authenticated using(public.is_admin());
create policy "orders owner read" on public.orders for select to authenticated using(customer_id=(select auth.uid()) or public.is_admin());
create policy "orders admin update" on public.orders for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "order items owner read" on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and (o.customer_id=(select auth.uid()) or public.is_admin())));
-- No public INSERT permissions for orders or items: only the server checkout endpoint can create orders.
-- Seed demo catalog (replace images and descriptions with store-approved assets).
insert into public.products(name,description,category,price,compare_at,stock,sku,featured,image_url) values
('Trailblazer MTB 27.5','27.5-inch mountain bike, durable frame and multi-speed gears','Mountain Bikes',14999,17999,12,'DCC-MTB-001',true,'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=1000'),
('City Glide Hybrid','Comfortable everyday hybrid cycle for city commuting','Hybrid Cycles',11999,13999,9,'DCC-HYB-001',true,'https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=1000'),
('Junior Star 20','Fun 20-inch cycle for young riders','Kids Cycles',6999,7999,15,'DCC-KID-001',true,'https://images.unsplash.com/photo-1511994298241-608e28f14fde?w=1000'),
('Road Sprint 700C','Lightweight road cycle for fitness and long rides','Road Bikes',22999,25999,6,'DCC-RD-001',false,'https://images.unsplash.com/photo-1541625602330-2277b4c461de?w=1000'),
('Safety Helmet','Adjustable helmet with ventilation','Accessories',1299,1599,30,'DCC-ACC-001',false,'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=1000'),
('Bike Lock','Strong combination lock for daily security','Accessories',699,899,50,'DCC-ACC-002',false,'https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?w=1000') on conflict(sku) do nothing;
-- Atomic checkout RPC: server-only execution, locks products, validates stock and server-side totals.
create or replace function public.place_cod_order(p_order_number text,p_customer_id uuid,p_name text,p_email text,p_phone text,p_address jsonb,p_notes text,p_lines jsonb,p_shipping numeric) returns uuid language plpgsql security definer set search_path=public as $$
declare v_order uuid;v_subtotal numeric:=0;v_total numeric;v_line jsonb;v_product public.products%rowtype;v_qty int;
begin
if jsonb_array_length(p_lines)<1 or jsonb_array_length(p_lines)>40 then raise exception 'Invalid cart';end if;
-- Lock all products in deterministic order to prevent overselling and deadlocks.
perform id from public.products where id in (select (x->>'product_id')::uuid from jsonb_array_elements(p_lines) x) order by id for update;
for v_line in select value from jsonb_array_elements(p_lines) loop
select * into v_product from public.products where id=(v_line->>'product_id')::uuid;
v_qty:=(v_line->>'quantity')::int;
if v_product.id is null or not v_product.active or v_qty<1 or v_qty>20 or v_product.stock<v_qty then raise exception 'Stock unavailable';end if;
v_subtotal:=v_subtotal+v_product.price*v_qty;
end loop;
if p_shipping <> (case when v_subtotal >= 10000 then 0 else 299 end) then
  raise exception 'Shipping mismatch';
end if;
v_total:=v_subtotal+p_shipping;
insert into public.orders(order_number,customer_id,customer_name,email,phone,address,notes,subtotal,shipping,total) values(p_order_number,p_customer_id,p_name,p_email,p_phone,p_address,p_notes,v_subtotal,p_shipping,v_total) returning id into v_order;
for v_line in select value from jsonb_array_elements(p_lines) loop
select * into v_product from public.products where id=(v_line->>'product_id')::uuid;v_qty:=(v_line->>'quantity')::int;
insert into public.order_items(order_id,product_id,name,sku,price,quantity,line_total) values(v_order,v_product.id,v_product.name,v_product.sku,v_product.price,v_qty,v_product.price*v_qty);
update public.products set stock=stock-v_qty where id=v_product.id;
end loop;
return v_order;
end $$;
revoke all on function public.place_cod_order(text,uuid,text,text,text,jsonb,text,jsonb,numeric) from public,anon,authenticated;
grant execute on function public.place_cod_order(text,uuid,text,text,text,jsonb,text,jsonb,numeric) to service_role;
-- Create a customer profile for each newly registered account.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,email,role) values(new.id,new.email,'customer') on conflict(id) do nothing; return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
