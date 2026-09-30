-- Qualify the outer object path: templates also contain a name column.
drop policy certificate_image_read on storage.objects;
create policy certificate_image_read on storage.objects for select to authenticated
using(bucket_id='certificate-templates' and (vertex_private.certificate_path_manage(storage.objects.name)
or exists(select 1 from public.certificate_templates t where t.storage_path=storage.objects.name
and vertex_private.certificate_context(t.id,(select auth.uid())) is not null)));
drop policy certificate_image_delete on storage.objects;
create policy certificate_image_delete on storage.objects for delete to authenticated
using(bucket_id='certificate-templates' and vertex_private.certificate_path_manage(storage.objects.name)
and not exists(select 1 from public.certificate_templates t where t.storage_path=storage.objects.name));
