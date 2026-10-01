-- Google push subscription tokens contain colons within their HTTPS path.
begin;
create or replace function public.save_push_subscription(subscription jsonb,app_origin text,choices jsonb default '{}')
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved uuid; key text;
begin
  if actor is null or not exists(select 1 from public.profiles where id=actor) then
    raise exception 'Log in to manage device notifications.' using errcode='42501';
  end if;
  if app_origin !~ '^(https://vertexarena[.]github[.]io|http://(127[.]0[.]0[.]1|localhost):4173)$'
    or app_origin is null then raise exception 'Unrecognised Vertex origin.' using errcode='23514'; end if;
  if coalesce(subscription->>'endpoint','') !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)/[A-Za-z0-9_/?=&%+:.-]+$'
    or length(coalesce(subscription->>'endpoint',''))>2048
    or coalesce(subscription->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{87}$'
    or coalesce(subscription->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'The browser returned an invalid push subscription. Enable notifications again.' using errcode='23514';
  end if;
  for key in select unnest(array['announcements','results','deadlines','meetings']) loop
    if choices ? key and jsonb_typeof(choices->key)<>'boolean' then
      raise exception 'Choose valid notification preferences.' using errcode='23514';
    end if;
  end loop;
  if not exists(select 1 from public.push_subscriptions where endpoint=subscription->>'endpoint')
    and (select count(*) from public.push_subscriptions where user_id=actor)>=20 then
    raise exception 'Too many devices. Turn off notifications on an older device first.' using errcode='23514';
  end if;
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth_key,app_origin,announcements,results,deadlines,meetings)
    values(actor,subscription->>'endpoint',subscription->'keys'->>'p256dh',subscription->'keys'->>'auth',app_origin,
      coalesce((choices->>'announcements')::boolean,true),coalesce((choices->>'results')::boolean,true),
      coalesce((choices->>'deadlines')::boolean,true),coalesce((choices->>'meetings')::boolean,true))
    on conflict(endpoint) do update set p256dh=excluded.p256dh,auth_key=excluded.auth_key,
      app_origin=excluded.app_origin,announcements=excluded.announcements,results=excluded.results,
      deadlines=excluded.deadlines,meetings=excluded.meetings,updated_at=now()
      where push_subscriptions.user_id=actor returning id into saved;
  if saved is null then raise exception 'This device belongs to another account. Log out there first.' using errcode='42501'; end if;
  delete from vertex_private.push_deliveries d using public.notifications n,public.push_subscriptions s
    where d.subscription_id=saved and s.id=saved and n.id=d.notification_id
      and d.state='pending' and not vertex_private.push_kind_enabled(s,n.kind);
  return saved;
end;
$$;
commit;
