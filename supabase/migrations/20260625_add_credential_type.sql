alter table pending_credentials add column if not exists credential_type text default 'academic_degree';
alter table credentials add column if not exists credential_type text default 'academic_degree';
