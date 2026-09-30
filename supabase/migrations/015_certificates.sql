-- Milestone 17: private templates and authoritative, dynamically rendered awards.
create table public.certificate_templates (
 id uuid primary key, competition_id uuid not null references public.competitions(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 100), award_title text not null check(length(btrim(award_title)) between 1 and 160),
 template_type text not null check(template_type in ('participation','top_100','finalist','winner','category_winner','custom_tag','placement')),
 round_id uuid references public.competition_rounds(id) on delete restrict, required_tag text,
 placement_min integer, placement_max integer,
 storage_path text not null unique, width integer not null check(width between 100 and 6000), height integer not null check(height between 100 and 6000),
 layout jsonb not null default '[]', ready boolean not null default false, version integer not null default 1,
 updated_by uuid not null references public.profiles(id), updated_at timestamptz not null default now(),
 check(width::bigint*height<=16000000), check(jsonb_typeof(layout)='array'),
 check(template_type<>'custom_tag' or coalesce(required_tag ~ '^[a-z0-9_]{1,50}$',false)),
 check(template_type<>'placement' or coalesce(placement_min>0 and placement_max>=placement_min,false))
);
create index certificate_templates_comp_idx on public.certificate_templates(competition_id);
create index certificate_templates_round_idx on public.certificate_templates(round_id);
create index certificate_templates_editor_idx on public.certificate_templates(updated_by);
create table public.competition_certificate_settings (
 competition_id uuid primary key references public.competitions(id) on delete cascade,
 enabled boolean not null default false, released_at timestamptz, released_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);
create index certificate_settings_releaser_idx on public.competition_certificate_settings(released_by);
create unique index certificate_notification_unique on public.notifications(recipient_id,competition_id) where kind='certificate_available';

create function vertex_private.certificate_registered(comp uuid, person uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from individual_registrations where competition_id=comp and participant_id=person)
 or exists(select 1 from competition_team_members m join competition_teams t on t.id=m.team_id where m.competition_id=comp and m.participant_id=person and t.registered_at is not null)
$$;
create function vertex_private.certificate_context(template uuid, person uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare t certificate_templates; c competitions; p profiles; outcome record; category_name text; team_name text; issue timestamptz; tag text;
begin
 select * into t from certificate_templates where id=template;
 if person is distinct from auth.uid() and not public.can_manage_competition(t.competition_id) then return null; end if;
 if t.id is null or not t.ready or not vertex_private.certificate_registered(t.competition_id,person) then return null; end if;
 select * into c from competitions where id=t.competition_id;
 select * into p from profiles where id=person and account_type='participant';
 select released_at into issue from competition_certificate_settings where competition_id=c.id and enabled;
 if p.id is null or c.status<>'published' or issue is null or c.certificates_available_at>now()
 or not exists(select 1 from competition_rounds r where r.competition_id=c.id and r.sequence=(select max(sequence) from competition_rounds where competition_id=c.id) and r.judging_state='finalised' and r.leaderboard_state='published') then return null; end if;
 tag:=case t.template_type when 'custom_tag' then t.required_tag else t.template_type end;
 select r.name as round_name,a.rank,e.source_team_id into outcome
 from round_participant_eligibility e join competition_rounds r on r.id=e.round_id
 join round_advancement_records a on a.round_id=e.round_id and (a.participant_id=person or a.team_id=e.source_team_id)
 where e.participant_id=person and r.competition_id=c.id and r.leaderboard_state='published'
 and (t.round_id is null or r.id=t.round_id)
 and (t.template_type='participation' or (t.template_type='placement' and a.rank between t.placement_min and t.placement_max) or tag=any(e.tags))
 order by r.sequence desc limit 1;
 if t.template_type<>'participation' and not found then return null; end if;
 select category into category_name from individual_registrations where competition_id=c.id and participant_id=person;
 select ct.name,ct.category into team_name,category_name from competition_teams ct join competition_team_members m on m.team_id=ct.id where ct.competition_id=c.id and m.participant_id=person and ct.registered_at is not null;
 if team_name is null then select category into category_name from individual_registrations where competition_id=c.id and participant_id=person; end if;
 return jsonb_build_object('participant_name',p.full_name,'team_name',coalesce(team_name,''),'competition_name',c.name,
 'organisation_name',coalesce((select name from organisations where id=c.organisation_id),''),'category',coalesce(category_name,''),
 'placement',coalesce(outcome.rank::text,''),'round',coalesce(outcome.round_name,''),'award_title',t.award_title,'issue_date',to_char(issue at time zone 'UTC','YYYY-MM-DD'));
end $$;
create function public.certificate_download_data(target_template_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare values_data jsonb; t certificate_templates;
begin
 values_data:=vertex_private.certificate_context(target_template_id,auth.uid());
 if values_data is null then raise exception 'This certificate is not available to your account.' using errcode='42501'; end if;
 select * into t from certificate_templates where id=target_template_id;
 return to_jsonb(t)||jsonb_build_object('values',values_data);
end $$;
create function public.my_competition_certificates(target_competition_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not vertex_private.certificate_registered(target_competition_id,auth.uid()) then raise exception 'Certificates are available to registered participants.' using errcode='42501'; end if;
 return jsonb_build_object('released',coalesce((select enabled from competition_certificate_settings where competition_id=target_competition_id),false),
 'templates',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'award_title',t.award_title,'template_type',t.template_type)) from certificate_templates t where t.competition_id=target_competition_id and vertex_private.certificate_context(t.id,auth.uid()) is not null),'[]'::jsonb));
end $$;
create function public.my_available_certificates() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x),'[]'::jsonb) from (select c.name,c.slug,count(*) as awards,s.released_at from certificate_templates t join competitions c on c.id=t.competition_id join competition_certificate_settings s on s.competition_id=c.id where vertex_private.certificate_context(t.id,auth.uid()) is not null group by c.id,s.released_at) x
$$;

create function public.save_certificate_template(target_competition_id uuid,target_template_id uuid,details jsonb,expected_version integer default null)
returns public.certificate_templates language plpgsql security definer set search_path=public,pg_temp as $$
declare old certificate_templates; saved certificate_templates; field jsonb; n text; image_width integer; image_height integer; image_path text;
begin
 if auth.uid() is null or not public.can_manage_competition(target_competition_id) then raise exception 'Only competition organisers can edit templates.' using errcode='42501'; end if;
 perform 1 from competitions where id=target_competition_id for update;
 if exists(select 1 from competition_certificate_settings where competition_id=target_competition_id and enabled) then raise exception 'Pause certificate release before editing templates.'; end if;
 select * into old from certificate_templates where id=target_template_id for update;
 if old.id is not null and (old.competition_id<>target_competition_id or expected_version is distinct from old.version) then raise exception 'Template changed. Reopen it before saving.'; end if;
 image_width:=(details->>'width')::integer; image_height:=(details->>'height')::integer; image_path:=details->>'storage_path';
 if image_path !~ ('^'||target_competition_id::text||'/'||target_template_id::text||'/[0-9a-f-]{36}\.(png|jpg|webp)$')
 or not exists(select 1 from storage.objects where bucket_id='certificate-templates' and name=image_path and (owner_id=auth.uid()::text or image_path=old.storage_path)) then raise exception 'Upload a valid template image first.'; end if;
 if jsonb_typeof(details->'layout') is distinct from 'array' or jsonb_array_length(details->'layout')>30 then raise exception 'Use up to 30 dynamic fields.'; end if;
 for field in select value from jsonb_array_elements(details->'layout') loop
  if jsonb_typeof(field)<>'object' or not field ?& array['id','source','font','align','colour','weight','x','y','width','height','size'] or field->>'source' is null or field->>'font' is null or field->>'align' is null or field->>'colour' is null or field->>'weight' is null or field->>'id' is null or field->>'source' not in ('participant_name','team_name','competition_name','organisation_name','category','placement','round','award_title','issue_date')
  or field->>'font' not in ('Geist','Arial','Georgia','Times New Roman','Verdana','Courier New') or field->>'align' not in ('left','center','right')
  or field->>'colour' !~ '^#[0-9a-fA-F]{6}$' or (field->>'weight')::integer not in (400,700) or field->>'id' !~ '^[0-9a-f-]{36}$' then raise exception 'Invalid field styling or source.'; end if;
  foreach n in array array['x','y','width','height','size'] loop
   if jsonb_typeof(field->n) is distinct from 'number' or (field->>n)::numeric<0 then raise exception 'Invalid field dimensions.'; end if;
  end loop;
  if (field->>'width')::numeric<10 or (field->>'height')::numeric<10 or (field->>'x')::numeric+(field->>'width')::numeric>image_width or (field->>'y')::numeric+(field->>'height')::numeric>image_height or (field->>'size')::numeric not between 8 and 240 then raise exception 'Keep fields inside the image; font size must be 8–240.'; end if;
 end loop;
 if coalesce((details->>'ready')::boolean,false) and not exists(select 1 from jsonb_array_elements(details->'layout') f where f->>'source'='participant_name') then raise exception 'Ready templates need a participant full name field.'; end if;
 if details->>'round_id' is not null and not exists(select 1 from competition_rounds where id=(details->>'round_id')::uuid and competition_id=target_competition_id) then raise exception 'Choose a round in this competition.'; end if;
 insert into certificate_templates(id,competition_id,name,award_title,template_type,round_id,required_tag,placement_min,placement_max,storage_path,width,height,layout,ready,updated_by)
 values(target_template_id,target_competition_id,btrim(details->>'name'),btrim(details->>'award_title'),details->>'template_type',(details->>'round_id')::uuid,details->>'required_tag',(details->>'placement_min')::integer,(details->>'placement_max')::integer,image_path,image_width,image_height,details->'layout',coalesce((details->>'ready')::boolean,false),auth.uid())
 on conflict(id) do update set name=excluded.name,award_title=excluded.award_title,template_type=excluded.template_type,round_id=excluded.round_id,required_tag=excluded.required_tag,placement_min=excluded.placement_min,placement_max=excluded.placement_max,storage_path=excluded.storage_path,width=excluded.width,height=excluded.height,layout=excluded.layout,ready=excluded.ready,version=certificate_templates.version+1,updated_by=auth.uid(),updated_at=now() returning * into saved;
 update competitions set certificate_status=case when exists(select 1 from certificate_templates where competition_id=target_competition_id and ready) then 'template_ready' else 'planned' end where id=target_competition_id;
 return saved;
end $$;
create function public.delete_certificate_template(target_template_id uuid) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare t certificate_templates;
begin
 select * into t from certificate_templates where id=target_template_id;
 if t.id is null or not public.can_manage_competition(t.competition_id) then raise exception 'Only competition organisers can delete templates.' using errcode='42501'; end if;
 perform 1 from competitions where id=t.competition_id for update;
 if exists(select 1 from competition_certificate_settings where competition_id=t.competition_id and enabled) then raise exception 'Pause certificate release before deleting templates.'; end if;
 delete from certificate_templates where id=t.id;
 update competitions set certificate_status=case when exists(select 1 from certificate_templates where competition_id=t.competition_id and ready) then 'template_ready' else 'planned' end where id=t.competition_id;
 return t.storage_path;
end $$;
create function public.set_certificate_release(target_competition_id uuid,enable_release boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare c competitions;
begin
 if auth.uid() is null or not public.can_manage_competition(target_competition_id) then raise exception 'Only competition organisers can release certificates.' using errcode='42501'; end if;
 select * into c from competitions where id=target_competition_id for update;
 if enable_release and (c.status<>'published' or c.certificates_available_at>now() or not exists(select 1 from certificate_templates where competition_id=c.id and ready)
 or not exists(select 1 from competition_rounds where competition_id=c.id and sequence=(select max(sequence) from competition_rounds where competition_id=c.id) and judging_state='finalised' and leaderboard_state='published')) then raise exception 'Publish final results, finish a template, and wait until the certificate availability date before releasing.'; end if;
 insert into competition_certificate_settings(competition_id,enabled,released_at,released_by) values(c.id,enable_release,case when enable_release then now() end,auth.uid())
 on conflict(competition_id) do update set enabled=enable_release,released_at=coalesce(competition_certificate_settings.released_at,excluded.released_at),released_by=auth.uid(),updated_at=now();
 if enable_release then
 insert into notifications(recipient_id,competition_id,kind,title,body,link_path)
 select distinct p.id,c.id,'certificate_available','Your certificate is ready',c.name||' · Download your eligible awards.','/competition/'||c.slug||'/certificates'
 from profiles p join certificate_templates t on t.competition_id=c.id where vertex_private.certificate_context(t.id,p.id) is not null
 on conflict(recipient_id,competition_id) where kind='certificate_available' do nothing;
 end if;
end $$;

alter table public.certificate_templates enable row level security;
alter table public.competition_certificate_settings enable row level security;
revoke all on public.certificate_templates,public.competition_certificate_settings from public,anon,authenticated;
grant select on public.certificate_templates,public.competition_certificate_settings to authenticated;
create policy certificate_template_read on public.certificate_templates for select to authenticated using (public.can_manage_competition(competition_id) or vertex_private.certificate_context(id,(select auth.uid())) is not null);
create policy certificate_settings_read on public.competition_certificate_settings for select to authenticated using(public.can_manage_competition(competition_id) or vertex_private.certificate_registered(competition_id,(select auth.uid())));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('certificate-templates','certificate-templates',false,10485760,array['image/png','image/jpeg','image/webp']);
create function vertex_private.certificate_path_manage(path text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$' and exists(select 1 from competitions c where c.id::text=split_part(path,'/',1) and public.can_manage_competition(c.id))
$$;
create policy certificate_image_insert on storage.objects for insert to authenticated with check(bucket_id='certificate-templates' and vertex_private.certificate_path_manage(name) and not exists(select 1 from public.competition_certificate_settings s where s.competition_id::text=split_part(name,'/',1) and s.enabled));
create policy certificate_image_read on storage.objects for select to authenticated using(bucket_id='certificate-templates' and (vertex_private.certificate_path_manage(name) or exists(select 1 from public.certificate_templates t where t.storage_path=name and vertex_private.certificate_context(t.id,(select auth.uid())) is not null)));
create policy certificate_image_delete on storage.objects for delete to authenticated using(bucket_id='certificate-templates' and vertex_private.certificate_path_manage(name) and not exists(select 1 from public.certificate_templates t where t.storage_path=name));
revoke all on function vertex_private.certificate_registered(uuid,uuid),vertex_private.certificate_context(uuid,uuid),vertex_private.certificate_path_manage(text) from public,anon,authenticated;
grant execute on function vertex_private.certificate_registered(uuid,uuid),vertex_private.certificate_context(uuid,uuid),vertex_private.certificate_path_manage(text) to authenticated;
revoke all on function public.certificate_download_data(uuid),public.my_competition_certificates(uuid),public.my_available_certificates(),public.save_certificate_template(uuid,uuid,jsonb,integer),public.delete_certificate_template(uuid),public.set_certificate_release(uuid,boolean) from public,anon;
grant execute on function public.certificate_download_data(uuid),public.my_competition_certificates(uuid),public.my_available_certificates(),public.save_certificate_template(uuid,uuid,jsonb,integer),public.delete_certificate_template(uuid),public.set_certificate_release(uuid,boolean) to authenticated;
alter publication supabase_realtime add table public.competition_certificate_settings;
