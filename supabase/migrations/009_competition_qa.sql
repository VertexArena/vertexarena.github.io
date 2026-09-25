begin;

create table public.competition_questions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(btrim(body)) between 1 and 3000),
  status text not null default 'open' check (status in ('open', 'answered', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index competition_questions_feed_idx on public.competition_questions (competition_id, created_at desc);
create index competition_questions_open_idx on public.competition_questions (competition_id, created_at desc) where status = 'open';
create index competition_questions_author_idx on public.competition_questions (author_id);

create table public.competition_question_replies (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.competition_questions(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(btrim(body)) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index competition_question_replies_question_idx on public.competition_question_replies (question_id, created_at);
create index competition_question_replies_author_idx on public.competition_question_replies (author_id);

create function public.can_read_competition_questions(target_competition_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.can_read_competition_announcements(target_competition_id);
$$;
revoke all on function public.can_read_competition_questions(uuid) from public, anon;
grant execute on function public.can_read_competition_questions(uuid) to authenticated;

alter table public.competition_questions enable row level security;
alter table public.competition_question_replies enable row level security;
revoke all on public.competition_questions, public.competition_question_replies from public, anon, authenticated;
grant select on public.competition_questions, public.competition_question_replies to authenticated;
create policy competition_questions_read on public.competition_questions for select to authenticated
  using (public.can_read_competition_questions(competition_id));
create policy competition_question_replies_read on public.competition_question_replies for select to authenticated
  using (exists (select 1 from public.competition_questions q
    where q.id = question_id and public.can_read_competition_questions(q.competition_id)));

alter table public.notifications add column qa_question_id uuid
  references public.competition_questions(id) on delete cascade;
alter table public.notifications add column qa_reply_id uuid
  references public.competition_question_replies(id) on delete cascade;
create index notifications_qa_question_idx on public.notifications (qa_question_id) where qa_question_id is not null;
create index notifications_qa_reply_idx on public.notifications (qa_reply_id) where qa_reply_id is not null;

create function public.ask_competition_question(target_competition_id uuid, message text)
returns public.competition_questions language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  competition public.competitions;
  created public.competition_questions;
begin
  if actor is null or not exists (select 1 from public.profiles
      where id = actor and account_type = 'participant')
     or not public.can_read_competition_questions(target_competition_id) then
    raise exception 'Only registered participants can ask questions.' using errcode = '42501';
  end if;
  select * into competition from public.competitions where id = target_competition_id for share;
  if competition.id is null or competition.status <> 'published' then
    raise exception 'This competition is unavailable.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(message, ''))) not between 1 and 3000 then
    raise exception 'Write a question between 1 and 3000 characters.' using errcode = '23514';
  end if;
  insert into public.competition_questions (competition_id, author_id, body)
    values (competition.id, actor, btrim(message)) returning * into created;
  insert into public.notifications (recipient_id, competition_id, qa_question_id, kind, title, body, link_path)
    select managers.id, competition.id, created.id, 'qa_question',
      'New competition question', left(created.body, 1000),
      '/competition/' || competition.slug || '/questions/' || created.id
    from (
      select competition.owner_id as id
      union
      select co.organiser_id from public.competition_organisers co
        where co.competition_id = competition.id and co.role = 'manager'
    ) managers;
  return created;
end;
$$;

create function public.reply_to_competition_question(target_question_id uuid, message text)
returns public.competition_question_replies language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  question public.competition_questions;
  reply public.competition_question_replies;
  slug text;
begin
  select * into question from public.competition_questions where id = target_question_id for update;
  if actor is null or question.id is null or not public.can_manage_competition(question.competition_id) then
    raise exception 'Only this competition’s organisers can reply.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(message, ''))) not between 1 and 3000 then
    raise exception 'Write a reply between 1 and 3000 characters.' using errcode = '23514';
  end if;
  insert into public.competition_question_replies (question_id, author_id, body)
    values (question.id, actor, btrim(message)) returning * into reply;
  update public.competition_questions set status = 'answered', updated_at = now() where id = question.id;
  select c.slug into slug from public.competitions c where c.id = question.competition_id;
  insert into public.notifications (recipient_id, competition_id, qa_question_id, qa_reply_id, kind, title, body, link_path)
    values (question.author_id, question.competition_id, question.id, reply.id, 'qa_reply',
      'Your question has a reply', left(reply.body, 1000),
      '/competition/' || slug || '/questions/' || question.id);
  return reply;
end;
$$;

create function public.edit_competition_question_reply(target_reply_id uuid, message text)
returns public.competition_question_replies language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  prior public.competition_question_replies;
  question public.competition_questions;
  changed public.competition_question_replies;
begin
  select * into prior from public.competition_question_replies where id = target_reply_id for update;
  select * into question from public.competition_questions where id = prior.question_id;
  if actor is null or prior.id is null or prior.author_id <> actor
     or not public.can_manage_competition(question.competition_id) then
    raise exception 'Only the reply author can edit this reply.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(message, ''))) not between 1 and 3000 then
    raise exception 'Write a reply between 1 and 3000 characters.' using errcode = '23514';
  end if;
  update public.competition_question_replies set body = btrim(message), updated_at = now()
    where id = prior.id returning * into changed;
  update public.notifications set body = left(changed.body, 1000) where qa_reply_id = changed.id;
  return changed;
end;
$$;

create function public.set_competition_question_resolved(target_question_id uuid, resolved boolean)
returns public.competition_questions language plpgsql security definer set search_path = public, pg_temp as $$
declare
  question public.competition_questions;
  changed public.competition_questions;
begin
  select * into question from public.competition_questions where id = target_question_id for update;
  if auth.uid() is null or question.id is null or not public.can_manage_competition(question.competition_id) then
    raise exception 'Only this competition’s organisers can change question status.' using errcode = '42501';
  end if;
  update public.competition_questions set status = case
      when resolved then 'resolved'
      when exists (select 1 from public.competition_question_replies where question_id = question.id) then 'answered'
      else 'open' end,
    updated_at = now() where id = question.id returning * into changed;
  return changed;
end;
$$;

revoke all on function public.ask_competition_question(uuid,text),
  public.reply_to_competition_question(uuid,text),
  public.edit_competition_question_reply(uuid,text),
  public.set_competition_question_resolved(uuid,boolean) from public, anon;
grant execute on function public.ask_competition_question(uuid,text),
  public.reply_to_competition_question(uuid,text),
  public.edit_competition_question_reply(uuid,text),
  public.set_competition_question_resolved(uuid,boolean) to authenticated;

alter publication supabase_realtime add table public.competition_questions;
alter publication supabase_realtime add table public.competition_question_replies;
commit;
