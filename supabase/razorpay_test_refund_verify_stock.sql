-- Run once in Supabase SQL Editor before using Check Refund Status.
alter table public.paid_cancellation_requests
 add column if not exists stock_restored_at timestamptz;
create or replace function public.confirm_test_refund_restore_stock(
 p_request_id uuid,p_refund_id text,p_amount_paise bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_request public.paid_cancellation_requests%rowtype;
 v_item public.order_items%rowtype;v_rows int;
begin
 select * into v_request from public.paid_cancellation_requests where id=p_request_id for update;
 if not found then raise exception 'Cancellation request not found'; end if;
 if v_request.razorpay_refund_id is distinct from p_refund_id
    or v_request.refund_amount_paise is distinct from p_amount_paise
    or v_request.status not in ('processing','refunded')
 then raise exception 'Refund reference, amount or status mismatch'; end if;
 if v_request.stock_restored_at is not null then
  return jsonb_build_object('restored',false,'already_restored',true,'status',v_request.status);
 end if;
 select * into v_item from public.order_items where id=v_request.item_id and order_id=v_request.order_id for update;
 if not found or v_item.product_id is null then raise exception 'Product for stock restoration not found'; end if;
 if v_request.quantity < 1 or v_request.quantity > v_item.quantity-coalesce(v_item.cancelled_quantity,0)
 then raise exception 'Invalid quantity to restore'; end if;
 update public.products set stock=stock+v_request.quantity where id=v_item.product_id;
 get diagnostics v_rows=row_count;
 if v_rows<>1 then raise exception 'Product update failed';end if;
 update public.order_items set cancelled_quantity=coalesce(cancelled_quantity,0)+v_request.quantity
 where id=v_item.id;
 update public.paid_cancellation_requests
 set status='refunded',refund_completed_at=coalesce(refund_completed_at,now()),stock_restored_at=now()
 where id=v_request.id;
 return jsonb_build_object('restored',true,'already_restored',false,'quantity',v_request.quantity,'status','refunded');
end;$$;
revoke all on function public.confirm_test_refund_restore_stock(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.confirm_test_refund_restore_stock(uuid,text,bigint) to service_role;
