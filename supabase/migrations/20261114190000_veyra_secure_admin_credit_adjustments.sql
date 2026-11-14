-- Secure Veyra admin credit adjustments. Only trusted server-side service_role may execute this RPC.
create or replace function public.veyra_admin_adjust_credits(
  p_user_email text,
  p_amount bigint,
  p_admin_email text,
  p_description text default null
)
returns table(user_id uuid, new_balance bigint, transaction_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_balance bigint;
  v_tx_id uuid;
begin
  if p_user_email is null or length(trim(p_user_email)) = 0
     or p_admin_email is null or length(trim(p_admin_email)) = 0
     or p_amount = 0 or abs(p_amount) > 10000000 then
    raise exception 'Invalid credit adjustment';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower(trim(p_user_email))
    and u.email_confirmed_at is not null
  limit 1;

  if v_user_id is null then
    raise exception 'No verified Veyra account found for that email';
  end if;

  insert into public.credit_wallets(user_id, balance, lifetime_earned)
  values (v_user_id, 0, 0)
  on conflict (user_id) do nothing;

  update public.credit_wallets w
  set balance = w.balance + p_amount,
      lifetime_earned = w.lifetime_earned + greatest(p_amount, 0),
      updated_at = now()
  where w.user_id = v_user_id
    and w.balance + p_amount >= 0
  returning w.balance into v_balance;

  if v_balance is null then
    raise exception 'Insufficient credits for this deduction';
  end if;

  insert into public.credit_transactions(user_id, amount, balance_after, transaction_type, description)
  values (
    v_user_id,
    p_amount,
    v_balance,
    'adjustment',
    coalesce(nullif(trim(p_description), ''), 'Admin credit adjustment')
      || ' · Admin: ' || lower(trim(p_admin_email))
  )
  returning id into v_tx_id;

  return query select v_user_id, v_balance, v_tx_id;
end;
$$;

revoke all on function public.veyra_admin_adjust_credits(text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.veyra_admin_adjust_credits(text, bigint, text, text) to service_role;
