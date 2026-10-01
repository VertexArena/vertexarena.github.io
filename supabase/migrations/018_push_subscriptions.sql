-- Milestone 20: device subscriptions, private delivery queue and deadline reminders.
begin;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) <= 2048),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth_key text not null check (auth_key ~ '^[A-Za-z0-9_-]{22}$'),
  app_origin text not null,
  announcements boolean not null default true,
  results boolean not null default true,
  deadlines boolean not null default true,
  meetings boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public,anon,authenticated;
grant select on public.push_subscriptions to authenticated;
create policy push_subscriptions_own on public.push_subscriptions for select to authenticated
  using (user_id=(select auth.uid()));

create table vertex_private.push_settings (
  singleton boolean primary key default true check(singleton),
  worker_url text,
  worker_token_id uuid not null,
  vapid_secret_id uuid,
  public_key text
);
insert into vertex_private.push_settings(worker_token_id)
  values(vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'vertex_push_worker_token'));
create table vertex_private.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  state text not null default 'pending' check(state in ('pending','sending','sent','dead')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease uuid,
  locked_until timestamptz,
  last_status integer,
  created_at timestamptz not null default now(),
  unique(notification_id,subscription_id)
);
create index push_deliveries_subscription_idx on vertex_private.push_deliveries(subscription_id);
create index push_deliveries_pending_idx on vertex_private.push_deliveries(available_at,created_at)
  where state in ('pending','sending');
create table vertex_private.deadline_reminders (
  user_id uuid not null references public.profiles(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  source_id uuid not null,
  source_kind text not null check(source_kind in ('registration','submission')),
  due_at timestamptz not null,
  primary key(user_id,source_id,source_kind,due_at)
);
create index deadline_reminders_competition_idx on vertex_private.deadline_reminders(competition_id);
alter table vertex_private.push_settings enable row level security;
alter table vertex_private.push_deliveries enable row level security;
alter table vertex_private.deadline_reminders enable row level security;
revoke all on vertex_private.push_settings,vertex_private.push_deliveries,vertex_private.deadline_reminders from public,anon,authenticated;

create function vertex_private.push_kind_enabled(s public.push_subscriptions,kind text)
returns boolean language sql immutable set search_path='' as $$
  select case kind when 'announcement' then s.announcements when 'leaderboard_published' then s.results
    when 'deadline_reminder' then s.deadlines when 'meeting_assignment' then s.meetings else false end;
$$;
create function public.save_push_subscription(subscription jsonb,app_origin text,choices jsonb default '{}')
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved uuid; key text;
begin
  if actor is null or not exists(select 1 from public.profiles where id=actor) then
    raise exception 'Log in to manage device notifications.' using errcode='42501';
  end if;
  if app_origin !~ '^(https://vertexarena[.]github[.]io|http://(127[.]0[.]0[.]1|localhost):4173)$'
    or app_origin is null then raise exception 'Unrecognised Vertex origin.' using errcode='23514'; end if;
  if coalesce(subscription->>'endpoint','') !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)/[A-Za-z0-9_/?=&%+.-]{1,1800}$'
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
create function public.remove_push_subscription(target_endpoint text)
returns void language sql security definer set search_path='' as $$
  delete from public.push_subscriptions where endpoint=target_endpoint and user_id=auth.uid();
$$;
create function public.push_application_key()
returns text language sql stable security definer set search_path='' as $$
  select public_key from vertex_private.push_settings where auth.uid() is not null and worker_url is not null;
$$;
revoke all on function public.save_push_subscription(jsonb,text,jsonb),public.remove_push_subscription(text),
  public.push_application_key() from public,anon;
grant execute on function public.save_push_subscription(jsonb,text,jsonb),public.remove_push_subscription(text),
  public.push_application_key() to authenticated;

-- These endpoints are callable only by the Edge Function's server role.
create function public.push_worker_authorized(worker_token text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from vertex_private.push_settings s join vault.decrypted_secrets v on v.id=s.worker_token_id
    where v.decrypted_secret=worker_token and length(worker_token)=64);
$$;
create function public.push_worker_keys(new_public text default null,new_private text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare settings vertex_private.push_settings;
begin
  select * into settings from vertex_private.push_settings for update;
  if settings.public_key is null and new_public is not null then
    if new_public !~ '^[A-Za-z0-9_-]{87}$' or coalesce(new_private,'') !~ '^[A-Za-z0-9_-]{43}$' then
      raise exception 'Invalid server signing keys.'; end if;
    update vertex_private.push_settings set public_key=new_public,
      vapid_secret_id=vault.create_secret(new_private,'vertex_push_vapid_private') returning * into settings;
  end if;
  return jsonb_build_object('publicKey',settings.public_key,'privateKey',
    (select decrypted_secret from vault.decrypted_secrets where id=settings.vapid_secret_id),
    'subject','https://vertexarena.github.io');
end;
$$;
create function vertex_private.queue_notification_push()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into vertex_private.push_deliveries(notification_id,subscription_id)
    select new.id,s.id from public.push_subscriptions s where s.user_id=new.recipient_id
      and vertex_private.push_kind_enabled(s,new.kind) on conflict do nothing;
  return new;
end;
$$;
create trigger queue_notification_push after insert on public.notifications
  for each row execute function vertex_private.queue_notification_push();

create function public.push_claim_batch()
returns jsonb language plpgsql security definer set search_path='' as $$
declare batch jsonb;
begin
  update vertex_private.push_deliveries set state='dead',lease=null,locked_until=null
    where state='sending' and locked_until<now() and attempts>=5;
  delete from vertex_private.push_deliveries d using public.notifications n,public.push_subscriptions s
    where d.notification_id=n.id and d.subscription_id=s.id and
      (d.created_at<now()-interval '7 days' or (d.state in ('pending','sending') and
        (n.read_at is not null or d.created_at<now()-interval '24 hours' or not vertex_private.push_kind_enabled(s,n.kind))));
  with candidates as (
    select id from vertex_private.push_deliveries where attempts<5 and
      ((state='pending' and available_at<=now()) or (state='sending' and locked_until<now()))
    order by created_at for update skip locked limit 50
  ), claimed as (
    update vertex_private.push_deliveries d set state='sending',attempts=attempts+1,
      lease=gen_random_uuid(),locked_until=now()+interval '2 minutes'
      where id in(select id from candidates) returning d.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'lease',d.lease,'notificationId',n.id,
      'recipient',n.recipient_id,'title',n.title,'body',left(n.body,240),'path',n.link_path,
      'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_key))),'[]'::jsonb)
    into batch from claimed d join public.notifications n on n.id=d.notification_id
      join public.push_subscriptions s on s.id=d.subscription_id;
  return batch;
end;
$$;
create function public.push_finish_delivery(target_id uuid,target_lease uuid,http_status integer)
returns void language plpgsql security definer set search_path='' as $$
declare delivery vertex_private.push_deliveries;
begin
  select * into delivery from vertex_private.push_deliveries where id=target_id and lease=target_lease and state='sending' for update;
  if delivery.id is null then return; end if;
  if http_status in (404,410) then delete from public.push_subscriptions where id=delivery.subscription_id; return; end if;
  update vertex_private.push_deliveries set last_status=http_status,locked_until=null,lease=null,
    state=case when http_status between 200 and 299 then 'sent'
      when attempts>=5 or (http_status between 400 and 499 and http_status not in(408,429)) then 'dead' else 'pending' end,
    available_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer))
    where id=target_id;
end;
$$;
revoke all on function public.push_worker_authorized(text),public.push_worker_keys(text,text),
  public.push_claim_batch(),public.push_finish_delivery(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.push_worker_authorized(text),public.push_worker_keys(text,text),
  public.push_claim_batch(),public.push_finish_delivery(uuid,uuid,integer) to service_role;

create function vertex_private.generate_deadline_reminders()
returns void language plpgsql security definer set search_path='' as $$
declare item record; created uuid;
begin
  -- A single reminder in the last 24 hours for eligible bookmarked registration
  -- deadlines and unfinished, active round work. Changed deadlines get a new receipt.
  for item in
    select b.participant_id actor,c.id competition,c.id source,'registration'::text kind,
      c.registration_closes_at due_at,'Registration closes soon'::text title,
      'Registration for '||c.name||' closes within 24 hours.' body,
      '/competition/'||c.slug||'/register' path
    from public.competition_bookmarks b join public.competitions c on c.id=b.competition_id
      join public.profiles p on p.id=b.participant_id
    where c.status='published' and c.registration_closes_at>now() and c.registration_closes_at<=now()+interval '24 hours'
      and (c.minimum_age is null or extract(year from age(current_date,p.birthday))>=c.minimum_age)
      and (c.maximum_age is null or extract(year from age(current_date,p.birthday))<=c.maximum_age)
      and not exists(select 1 from public.individual_registrations i where i.competition_id=c.id and i.participant_id=b.participant_id)
      and not exists(select 1 from public.competition_team_members m join public.competition_teams t on t.id=m.team_id
        where m.competition_id=c.id and m.participant_id=b.participant_id and t.registered_at is not null)
    union all
    select roster.actor,c.id,r.id,'submission',cfg.closes_at,'Submission closes soon',
      case when roster.team_id is null then 'Your ' else 'Your team’s ' end||r.name||' submission for '||c.name||' closes within 24 hours.',
      '/competition/'||c.slug||'/submissions/'||r.slug
    from public.round_submission_configs cfg join public.competition_rounds r on r.id=cfg.round_id
      join public.competitions c on c.id=r.competition_id
      join lateral (
        select i.participant_id actor,null::uuid team_id from public.individual_registrations i where i.competition_id=c.id
        union all select m.participant_id,t.id from public.competition_team_members m
          join public.competition_teams t on t.id=m.team_id where t.competition_id=c.id and t.registered_at is not null
      ) roster on true
    where c.status='published' and cfg.enabled and cfg.opens_at<=now() and cfg.closes_at>now()
      and cfg.closes_at<=now()+interval '24 hours'
      and (r.sequence=1 or exists(select 1 from public.competition_rounds prev where prev.competition_id=c.id
        and prev.sequence=r.sequence-1 and prev.leaderboard_state='published'))
      and public.round_entry_eligible(r.id,case when roster.team_id is null then roster.actor end,roster.team_id)
      and not exists(select 1 from public.round_submissions sub where sub.round_id=r.id
        and ((roster.team_id is null and sub.participant_id=roster.actor) or sub.team_id=roster.team_id))
  loop
    created:=null;
    insert into vertex_private.deadline_reminders(user_id,competition_id,source_id,source_kind,due_at)
      values(item.actor,item.competition,item.source,item.kind,item.due_at) on conflict do nothing returning user_id into created;
    if created is not null then
      insert into public.notifications(recipient_id,competition_id,kind,title,body,link_path)
        values(item.actor,item.competition,'deadline_reminder',item.title,item.body,item.path);
    end if;
  end loop;
end;
$$;
create function vertex_private.wake_push_worker()
returns bigint language plpgsql security definer set search_path='' as $$
declare settings vertex_private.push_settings; request_id bigint;
begin
  perform vertex_private.generate_deadline_reminders();
  select * into settings from vertex_private.push_settings;
  if settings.worker_url is null then return null; end if;
  select net.http_post(url:=settings.worker_url,headers:=jsonb_build_object('Content-Type','application/json',
    'x-vertex-worker',(select decrypted_secret from vault.decrypted_secrets where id=settings.worker_token_id)),
    body:='{}'::jsonb,timeout_milliseconds:=60000) into request_id;
  return request_id;
end;
$$;
revoke all on function vertex_private.push_kind_enabled(public.push_subscriptions,text),
  vertex_private.queue_notification_push(),vertex_private.generate_deadline_reminders(),vertex_private.wake_push_worker()
  from public,anon,authenticated;
select cron.schedule('vertex-push-delivery','* * * * *','select vertex_private.wake_push_worker();');
commit;
