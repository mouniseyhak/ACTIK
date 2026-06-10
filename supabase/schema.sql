-- Actik schema for Supabase (run in the SQL editor).
-- Enables pgcrypto for gen_random_uuid().
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user. Holds zk-vault envelopes (ciphertext only).
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  vault_envelope_pin text,
  vault_pin_salt text,
  vault_envelope_passkey text,
  passkey_id text
);

-- ---------------------------------------------------------------------------
-- issuers: the TRUST REGISTRY. Maps an issuer DID to its public key + whether
-- it is accredited. `accredited` would be controlled by MoEYS in production.
-- ---------------------------------------------------------------------------
create table if not exists issuers (
  id uuid primary key default gen_random_uuid(),
  owner uuid references auth.users(id) on delete set null,
  name text not null,
  did text not null unique,
  public_jwk jsonb not null,
  accredited boolean not null default false,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- pending_credentials: an issuer's "outbox" keyed by recipient email. The
-- holder claims these, encrypts them into their vault, then deletes the row.
-- ---------------------------------------------------------------------------
create table if not exists pending_credentials (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  sdjwt text not null,
  issuer_did text not null,
  label text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- credentials: the holder's encrypted credentials (zk-vault AES-GCM output).
-- ---------------------------------------------------------------------------
create table if not exists credentials (
  id uuid primary key default gen_random_uuid(),
  owner uuid references auth.users(id) on delete cascade not null,
  label text,
  cipher text not null,
  iv text not null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- shares: time-limited selective-disclosure presentations for verifiers.
-- ---------------------------------------------------------------------------
create table if not exists shares (
  id uuid primary key default gen_random_uuid(),
  owner uuid references auth.users(id) on delete cascade not null,
  presentation text not null,
  issuer_did text not null,
  revealed jsonb,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table profiles enable row level security;
alter table issuers enable row level security;
alter table pending_credentials enable row level security;
alter table credentials enable row level security;
alter table shares enable row level security;

-- profiles: only the owner.
create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- issuers: public registry (anyone can read), owner can create/update theirs.
create policy "read registry" on issuers for select using (true);
create policy "manage own issuer" on issuers
  for insert with check (auth.uid() = owner);
create policy "update own issuer" on issuers
  for update using (auth.uid() = owner);

-- pending_credentials: any authenticated user may create (issue) one; the
-- recipient reads/deletes rows addressed to their email.
create policy "issue pending" on pending_credentials
  for insert to authenticated with check (true);
create policy "read my pending" on pending_credentials
  for select to authenticated using (recipient_email = lower(auth.jwt() ->> 'email'));
create policy "delete my pending" on pending_credentials
  for delete to authenticated using (recipient_email = lower(auth.jwt() ->> 'email'));

-- credentials: only the owner.
create policy "own credentials" on credentials
  for all using (auth.uid() = owner) with check (auth.uid() = owner);

-- shares: owner manages; ANYONE can read by id (a share link is a bearer token).
create policy "owner manages shares" on shares
  for all using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "public read share" on shares
  for select using (true);
