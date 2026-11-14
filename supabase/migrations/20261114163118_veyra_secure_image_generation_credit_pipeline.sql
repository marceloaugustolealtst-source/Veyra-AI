-- Privileged, atomic credit reservation and settlement for Veyra image generation.
create or replace function public.veyra_reserve_image_generation(
  p_user_id uuid, p_prompt text, p_size text, p_quality text, p_cost bigint
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_balance bigint; v_generation_id uuid := gen_random_uuid();
begin
  if auth.jwt() ->> 'role' <> 'service_role' then raise exception 'not_authorized'; end if;
  if p_user_id is null or length(trim(p_prompt)) < 3 or length(p_prompt) > 20000 then raise exception 'invalid_request'; end if;
  if p_size not in ('1024x1024','1536x1024','1024x1536') then raise exception 'invalid_size'; end if;
  if (p_quality, p_cost) not in (('low',8),('medium',12),('high',20)) then raise exception 'invalid_pricing'; end if;
  update public.credit_wallets set balance=balance-p_cost where user_id=p_user_id and balance>=p_cost returning balance into v_balance;
  if not found then raise exception 'insufficient_credits'; end if;
  insert into public.generations(id,user_id,mode,prompt,settings,status,credits_reserved,credits_charged,provider,started_at)
  values(v_generation_id,p_user_id,'image',trim(p_prompt),jsonb_build_object('size',p_size,'quality',p_quality,'model','gpt-image-2.5-flare'),'processing',p_cost,0,'openai',now());
  insert into public.credit_transactions(user_id,amount,balance_after,transaction_type,description,reference_id)
  values(p_user_id,-p_cost,v_balance,'generation','AI image generation reserved',v_generation_id);
  return v_generation_id;
end; $$;

create or replace function public.veyra_complete_image_generation(
  p_user_id uuid, p_generation_id uuid, p_object_path text, p_file_size bigint, p_model text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare v_balance bigint;
begin
  if auth.jwt() ->> 'role' <> 'service_role' then raise exception 'not_authorized'; end if;
  if p_object_path is null or p_object_path not like p_user_id::text || '/%' then raise exception 'invalid_object_path'; end if;
  update public.generations set status='succeeded',credits_charged=credits_reserved,completed_at=now(),provider='openai',settings=settings || jsonb_build_object('model',p_model)
  where id=p_generation_id and user_id=p_user_id and status='processing';
  if not found then raise exception 'generation_not_pending'; end if;
  insert into public.media_assets(user_id,generation_id,media_type,bucket_id,object_path,mime_type,file_size_bytes,metadata)
  values(p_user_id,p_generation_id,'image','veyra-user-media',p_object_path,'image/png',p_file_size,jsonb_build_object('provider','openai','model',p_model));
  select balance into v_balance from public.credit_wallets where user_id=p_user_id;
  return coalesce(v_balance,0);
end; $$;

create or replace function public.veyra_refund_image_generation(
  p_user_id uuid, p_generation_id uuid, p_reason text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare v_cost bigint; v_balance bigint;
begin
  if auth.jwt() ->> 'role' <> 'service_role' then raise exception 'not_authorized'; end if;
  select credits_reserved into v_cost from public.generations where id=p_generation_id and user_id=p_user_id and status='processing' for update;
  if not found then return null; end if;
  update public.credit_wallets set balance=balance+v_cost where user_id=p_user_id returning balance into v_balance;
  insert into public.credit_transactions(user_id,amount,balance_after,transaction_type,description,reference_id)
  values(p_user_id,v_cost,v_balance,'refund',left(coalesce(p_reason,'Image generation failed'),240),p_generation_id);
  update public.generations set status='failed',error_message=left(coalesce(p_reason,'Image generation failed'),500),completed_at=now()
  where id=p_generation_id and user_id=p_user_id and status='processing';
  return v_balance;
end; $$;

revoke all on function public.veyra_reserve_image_generation(uuid,text,text,text,bigint) from public,anon,authenticated;
revoke all on function public.veyra_complete_image_generation(uuid,uuid,text,bigint,text) from public,anon,authenticated;
revoke all on function public.veyra_refund_image_generation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.veyra_reserve_image_generation(uuid,text,text,text,bigint) to service_role;
grant execute on function public.veyra_complete_image_generation(uuid,uuid,text,bigint,text) to service_role;
grant execute on function public.veyra_refund_image_generation(uuid,uuid,text) to service_role;
