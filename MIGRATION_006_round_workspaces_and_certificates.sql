-- Round workspace creation and shared certificate preview access.
drop policy if exists "submission boxes organiser insert" on public.submission_boxes;
create policy "submission boxes organiser insert" on public.submission_boxes for insert
with check(public.is_comp_organiser((select competition_id from public.rounds where id=round_id)));
grant insert on public.submission_boxes to authenticated;

create or replace function public.can_read_certificate_object(object_name text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(
  select 1 from public.certificate_templates ct
  where ct.image_path=object_name and public.is_comp_organiser(ct.competition_id)
 )
$$;
grant execute on function public.can_read_certificate_object(text) to authenticated;

drop policy if exists "competition organisers read certificate templates" on storage.objects;
create policy "competition organisers read certificate templates" on storage.objects for select
using(bucket_id='certificate-templates' and public.can_read_certificate_object(name));
notify pgrst, 'reload schema';
