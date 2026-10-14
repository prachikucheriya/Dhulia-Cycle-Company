-- Run in Supabase SQL Editor before using Razorpay test checkout.
create table if not exists public.razorpay_payment_intents (
 razorpay_order_id text primary key,
 customer_id uuid references auth.users(id) on delete set null,
 customer_name text not null,email text not null,phone text not null,
 address jsonb not null,notes text not null default '',
 lines jsonb not null,shipping numeric(12,2) not null,
 amount_paise bigint not null check(amount_paise>0),
 created_at timestamptz not null default now(),
 finalized_order_id uuid references public.orders(id)
);
alter table public.razorpay_payment_intents enable row level security;
-- No public policies: only the service role can access intents.
create or replace function public.finalize_razorpay_payment(p_razorpay_order_id text,p_razorpay_payment_id text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_intent public.razorpay_payment_intents%rowtype;v_id uuid;v_number text;
begin
 select * into v_intent from public.razorpay_payment_intents where razorpay_order_id=p_razorpay_order_id for update;
 if not found then raise exception 'Payment intent not found';end if;
 if v_intent.finalized_order_id is not null then return v_intent.finalized_order_id;end if;
 if now()-v_intent.created_at>interval '2 days' then raise exception 'Payment intent expired; contact support';end if;
 v_number:='DCC-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
 v_id:=public.place_cod_order(v_number,v_intent.customer_id,v_intent.customer_name,v_intent.email,v_intent.phone,v_intent.address,v_intent.notes,v_intent.lines,v_intent.shipping);
 update public.orders set payment_method='RAZORPAY',payment_status='paid',
 notes=concat_ws(E'\n',nullif(notes,''),'Razorpay Payment ID: '||p_razorpay_payment_id,'Razorpay Order ID: '||p_razorpay_order_id)
 where id=v_id;
 update public.razorpay_payment_intents set finalized_order_id=v_id where razorpay_order_id=p_razorpay_order_id;
 return v_id;
end;$$;
revoke all on function public.finalize_razorpay_payment(text,text) from public,anon,authenticated;
grant execute on function public.finalize_razorpay_payment(text,text) to service_role;

-- Paid orders require a refund workflow; block cancellation until refunds are implemented.
create or replace function public.prevent_paid_order_cancellation() returns trigger language plpgsql set search_path=public as $$
begin
 if old.payment_status='paid' and (new.status='cancelled' or new.subtotal<old.subtotal) then
  raise exception 'Online paid orders require a refund process; contact support';
 end if;
 return new;
end;$$;
drop trigger if exists trg_prevent_paid_order_cancellation on public.orders;
create trigger trg_prevent_paid_order_cancellation before update on public.orders for each row execute function public.prevent_paid_order_cancellation();
