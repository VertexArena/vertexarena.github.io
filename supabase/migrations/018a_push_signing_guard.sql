-- Explicit singleton predicate also supports PostgREST safe-update guards.
begin;
create or replace function public.push_worker_keys(new_public text default null,new_private text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare settings vertex_private.push_settings;
begin
  select * into settings from vertex_private.push_settings for update;
  if settings.public_key is null and new_public is not null then
    if new_public !~ '^[A-Za-z0-9_-]{87}$' or coalesce(new_private,'') !~ '^[A-Za-z0-9_-]{43}$' then
      raise exception 'Invalid server signing keys.'; end if;
    update vertex_private.push_settings set public_key=new_public,
      vapid_secret_id=vault.create_secret(new_private,'vertex_push_vapid_private') where singleton=true returning * into settings;
  end if;
  return jsonb_build_object('publicKey',settings.public_key,'privateKey',
    (select decrypted_secret from vault.decrypted_secrets where id=settings.vapid_secret_id),
    'subject','https://vertexarena.github.io');
end;
$$;
commit;
