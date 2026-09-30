-- Existing hosted projects may have broad owner policies. Restrictive guards
-- enforce certificate boundaries regardless of other permissive policies.
create policy certificate_insert_guard on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'certificate-templates' or (vertex_private.certificate_path_manage(storage.objects.name)
and not exists(select 1 from public.competition_certificate_settings s where s.competition_id::text=split_part(storage.objects.name,'/',1) and s.enabled)));
create policy certificate_read_guard on storage.objects as restrictive for select to authenticated
using(bucket_id<>'certificate-templates' or (vertex_private.certificate_path_manage(storage.objects.name)
or exists(select 1 from public.certificate_templates t where t.storage_path=storage.objects.name
and vertex_private.certificate_context(t.id,(select auth.uid())) is not null)));
create policy certificate_update_guard on storage.objects as restrictive for update to authenticated
using(bucket_id<>'certificate-templates') with check(bucket_id<>'certificate-templates');
create policy certificate_delete_guard on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'certificate-templates' or (vertex_private.certificate_path_manage(storage.objects.name)
and not exists(select 1 from public.certificate_templates t where t.storage_path=storage.objects.name)));
