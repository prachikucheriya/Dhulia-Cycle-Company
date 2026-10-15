-- Run after paid_cancellation_requests.sql. Remove any duplicate active requests before applying this index.
create unique index if not exists paid_cancellation_one_active_request_per_item
on public.paid_cancellation_requests(order_id,item_id)
where status in ('pending','approved');
