-- Round-specific participation awards require an authoritative result in that round.
create or replace function vertex_private.certificate_context(template uuid, person uuid) returns jsonb
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
 if (t.template_type<>'participation' or t.round_id is not null) and not found then return null; end if;
 select category into category_name from individual_registrations where competition_id=c.id and participant_id=person;
 select ct.name,ct.category into team_name,category_name from competition_teams ct join competition_team_members m on m.team_id=ct.id where ct.competition_id=c.id and m.participant_id=person and ct.registered_at is not null;
 if team_name is null then select category into category_name from individual_registrations where competition_id=c.id and participant_id=person; end if;
 return jsonb_build_object('participant_name',p.full_name,'team_name',coalesce(team_name,''),'competition_name',c.name,
 'organisation_name',coalesce((select name from organisations where id=c.organisation_id),''),'category',coalesce(category_name,''),
 'placement',coalesce(outcome.rank::text,''),'round',coalesce(outcome.round_name,''),'award_title',t.award_title,'issue_date',to_char(issue at time zone 'UTC','YYYY-MM-DD'));
end $$;
