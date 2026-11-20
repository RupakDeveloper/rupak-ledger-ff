-- Additive avatar migration; preserves all existing records.
alter table public.profiles add column if not exists avatar_url text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars','avatars',true,3145728,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=true, file_size_limit=3145728, allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif'];
create policy "Avatar images publicly readable" on storage.objects for select to anon, authenticated using (bucket_id='avatars');
create policy "Users upload own avatar" on storage.objects for insert to authenticated with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Users replace own avatar" on storage.objects for update to authenticated using (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Users delete own avatar" on storage.objects for delete to authenticated using (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
