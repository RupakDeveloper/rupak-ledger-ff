-- ADDITIVE migration for notifications. It does not modify existing ledger records.
create table if not exists public.ledger_notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (length(title) between 1 and 100),
 body text not null check (length(body) between 1 and 1000),
 sent_at timestamptz not null default now(),
 seen boolean not null default false
);

alter table public.ledger_notifications enable row level security;

-- Users can read their own notifications; admin can read all.
create policy "Users read own notifications" on public.ledger_notifications
 for select to authenticated using (user_id = auth.uid() or public.is_ledger_admin());
create policy "Admin sends notifications" on public.ledger_notifications
 for insert to authenticated with check (public.is_ledger_admin());
create policy "Users mark own notifications seen" on public.ledger_notifications
 for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Admin deletes notifications" on public.ledger_notifications
 for delete to authenticated using (public.is_ledger_admin());

grant select, insert, update, delete on public.ledger_notifications to authenticated;
