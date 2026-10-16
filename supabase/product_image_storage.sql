-- Run once in Supabase SQL Editor. Product images are publicly readable; uploads are admin-only.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create policy "product images admin upload" on storage.objects
for insert to authenticated
with check (bucket_id='product-images' and public.is_admin());

create policy "product images public view" on storage.objects
for select to anon,authenticated
using (bucket_id='product-images');
