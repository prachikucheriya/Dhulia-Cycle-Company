-- Run ONCE in Supabase SQL Editor before enabling cancellation in production.
-- Atomic, idempotent cancellation: only placed/confirmed/packed orders can be cancelled.
create or replace function public.cancel_order_restore_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_item record;
begin
  select status into v_status from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_status = 'cancelled' then return; end if;
  if v_status not in ('placed','confirmed','packed') then
    raise exception 'Only orders not yet dispatched can be cancelled';
  end if;
  for v_item in
    select product_id, sum(quantity)::integer as qty
    from public.order_items
    where order_id = p_order_id and product_id is not null
    group by product_id
    order by product_id
  loop
    update public.products set stock = stock + v_item.qty where id = v_item.product_id;
    if not found then raise exception 'Product missing; cancellation rolled back'; end if;
  end loop;
  update public.orders set status = 'cancelled' where id = p_order_id;
end;
$$;
revoke all on function public.cancel_order_restore_stock(uuid) from public, anon, authenticated;
grant execute on function public.cancel_order_restore_stock(uuid) to service_role;
