-- Run once before enabling Razorpay Test Refund buttons.
alter table public.paid_cancellation_requests
 drop constraint if exists paid_cancellation_requests_status_check;
alter table public.paid_cancellation_requests
 add constraint paid_cancellation_requests_status_check
 check (status in ('pending','approved','rejected','processing','refunded','refund_failed'));
alter table public.paid_cancellation_requests
 add column if not exists razorpay_refund_id text,
 add column if not exists refund_amount_paise bigint,
 add column if not exists refund_started_at timestamptz,
 add column if not exists refund_completed_at timestamptz;
create unique index if not exists paid_cancellation_unique_refund_id
 on public.paid_cancellation_requests(razorpay_refund_id)
 where razorpay_refund_id is not null;
-- Also block concurrent refund requests for the same order item.
drop index if exists public.paid_cancellation_one_active_request_per_item;
create unique index paid_cancellation_one_active_request_per_item
 on public.paid_cancellation_requests(order_id,item_id)
 where status in ('pending','approved','processing','refunded','refund_failed');
create or replace function public.reserve_test_refund(p_request_id uuid,p_amount_paise bigint)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_count int;
begin
 if p_amount_paise<=0 then raise exception 'Invalid refund amount'; end if;
 update public.paid_cancellation_requests
 set status='processing',refund_amount_paise=p_amount_paise,refund_started_at=now()
 where id=p_request_id and status='approved';
 get diagnostics v_count=row_count;
 return v_count=1;
end;$$;
revoke all on function public.reserve_test_refund(uuid,bigint) from public,anon,authenticated;
grant execute on function public.reserve_test_refund(uuid,bigint) to service_role;
