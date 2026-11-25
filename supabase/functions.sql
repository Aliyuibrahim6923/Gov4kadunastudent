-- Kaduna Student Voice: secret-gated database functions.
-- Run AFTER schema.sql. Lets the Vercel server use the public (publishable/anon) key:
-- the table itself stays closed to that key, and these two functions only work
-- when the caller also sends KSV_DB_SECRET, which lives only in Vercel's settings.
-- The database stores just the SHA-256 hash of that secret.
--
-- Before running, replace <SHA256_OF_KSV_DB_SECRET> with the hex SHA-256 of your secret:
--   node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" 'YOUR_SECRET'

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.ksv_config (
  id          int primary key default 1 check (id = 1),
  secret_hash text not null
);
insert into private.ksv_config (id, secret_hash) values (1, '<SHA256_OF_KSV_DB_SECRET>')
on conflict (id) do update set secret_hash = excluded.secret_hash;

create or replace function private.ksv_check(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_secret is null
     or encode(sha256(convert_to(p_secret, 'UTF8')), 'hex')
        is distinct from (select secret_hash from private.ksv_config where id = 1) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- Insert one validated response (validation happens in api/submit.js).
create or replace function public.ksv_insert(p_secret text, p_row jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ksv_check(p_secret);
  insert into public.responses (name, phone, whatsapp, email, institution, level, lga, ward, pu, pu_code, gender, age, pvc, overall, rate_edu, rate_welfare, rate_fees, rate_security, rate_jobs, rate_health, rate_roads, rate_power, rate_transport, rate_ict, rate_agric, rate_sports, rate_gov, nelfund, nelfund_reason, nelfund_wait, nelfund_issue, nelfund_rate, scholarship, other_sch, other_sch_name, other_sch_issue, transport, transport_rate, empower, empower_name, commend, commend_note, shortfalls, shortfall_note, want_short, want_long, priorities, strengthen_note, message, volunteer, consent, raw)
  select name, phone, whatsapp, email, institution, level, lga, ward, pu, pu_code, gender, age, pvc, overall, rate_edu, rate_welfare, rate_fees, rate_security, rate_jobs, rate_health, rate_roads, rate_power, rate_transport, rate_ict, rate_agric, rate_sports, rate_gov, nelfund, nelfund_reason, nelfund_wait, nelfund_issue, nelfund_rate, scholarship, other_sch, other_sch_name, other_sch_issue, transport, transport_rate, empower, empower_name, commend, commend_note, shortfalls, shortfall_note, want_short, want_long, priorities, strengthen_note, message, volunteer, consent, raw
  from jsonb_populate_record(null::public.responses, p_row);
end;
$$;

-- Page through responses, newest first, without the raw audit column.
create or replace function public.ksv_list(p_secret text, p_limit int default 1000, p_offset int default 0)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ksv_check(p_secret);
  return query
    select to_jsonb(r) - 'raw'
    from public.responses r
    order by r.created_at desc, r.id desc
    limit least(greatest(p_limit, 1), 1000) offset greatest(p_offset, 0);
end;
$$;

revoke all on function private.ksv_check(text) from public, anon, authenticated;
revoke all on function public.ksv_insert(text, jsonb) from public, anon, authenticated;
revoke all on function public.ksv_list(text, int, int) from public, anon, authenticated;
grant execute on function public.ksv_insert(text, jsonb) to anon, service_role;
grant execute on function public.ksv_list(text, int, int) to anon, service_role;
