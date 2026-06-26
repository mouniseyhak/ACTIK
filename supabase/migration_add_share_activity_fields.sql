alter table shares add column if not exists recipient_label text;
alter table shares add column if not exists revoked_at timestamptz;
