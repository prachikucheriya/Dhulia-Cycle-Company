-- Dhulia Cycle Company: partial and full cancellation, atomic and idempotent.
-- Run in Supabase SQL Editor BEFORE deploying the new site.
alter table public.order_items add column if not exists cancelled_quantity integer not null default 0;
alter table public.order_items drop constraint if exists order_items_cancelled_quantity_check;
alter table public.order_items add constraint order_items_cancelled_quantity_check check (cancelled_quantity >= 0 and cancelled_quantity <= quantity);

create or replace function public.cancel_order_item_restore_stock(p_order_id uuid,p_item_id uuid,p_quantity integer)
returns void language plpgsql security definer set search_path=public as $$
declare v_status text;v_item public.order_items%rowtype;v_left integer;v_subtotal numeric(12,2);
begin
 select status into v_status from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found';end if;
 if v_status not in ('placed','confirmed','packed') then raise exception 'Order cannot be cancelled after dispatch';end if;
 select * into v_item from public.order_items where id=p_item_id and order_id=p_order_id for update;
 if not found then raise exception 'Order item not found';end if;
 v_left:=v_item.quantity-v_item.cancelled_quantity;
 if p_quantity is null or p_quantity<1 or p_quantity>v_left then raise exception 'Invalid cancellation quantity';end if;
 if v_item.product_id is null then raise exception 'Product no longer exists; contact support';end if;
 update public.products set stock=stock+p_quantity where id=v_item.product_id;
 if not found then raise exception 'Product missing; cancellation rolled back';end if;
 update public.order_items set cancelled_quantity=cancelled_quantity+p_quantity where id=p_item_id;
 select coalesce(sum(price*(quantity-cancelled_quantity)),0) into v_subtotal from public.order_items where order_id=p_order_id;
 if v_subtotal=0 then
  update public.orders set status='cancelled',subtotal=0,shipping=0,total=0 where id=p_order_id;
 else
  update public.orders set subtotal=v_subtotal,total=v_subtotal+shipping where id=p_order_id;
 end if;
end;$$;
revoke all on function public.cancel_order_item_restore_stock(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.cancel_order_item_restore_stock(uuid,uuid,integer) to service_role;

create or replace function public.cancel_order_restore_stock(p_order_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_status text;v_item record;
begin
 select status into v_status from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found';end if;
 if v_status='cancelled' then return;end if;
 if v_status not in ('placed','confirmed','packed') then raise exception 'Only orders not yet dispatched can be cancelled';end if;
 for v_item in
  select product_id,sum(quantity-cancelled_quantity)::integer as qty
  from public.order_items where order_id=p_order_id and product_id is not null
  group by product_id order by product_id
 loop
  if v_item.qty>0 then
   update public.products set stock=stock+v_item.qty where id=v_item.product_id;
   if not found then raise exception 'Product missing; cancellation rolled back';end if;
  end if;
 end loop;
 update public.order_items set cancelled_quantity=quantity where order_id=p_order_id;
 update public.orders set status='cancelled',subtotal=0,shipping=0,total=0 where id=p_order_id;
end;$$;
revoke all on function public.cancel_order_restore_stock(uuid) from public,anon,authenticated;
grant execute on function public.cancel_order_restore_stock(uuid) to service_role;
