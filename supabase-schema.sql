-- Esquema RSAC Practice Suite
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text default 'PF',
  email text,
  phone text,
  created_at timestamptz default now()
);

create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client_id uuid references clients(id) on delete set null,
  number text,
  area text,
  status text default 'Ativo',
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due_date date,
  done boolean default false,
  created_at timestamptz default now()
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  time text,
  location text,
  created_at timestamptz default now()
);

create table if not exists finance_entries (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric not null,
  type text not null,
  date date not null,
  client_id uuid references clients(id) on delete set null,
  created_at timestamptz default now()
);

-- Segurança: só usuários autenticados (você e sua equipe) podem ler/gravar
alter table clients enable row level security;
alter table cases enable row level security;
alter table tasks enable row level security;
alter table appointments enable row level security;
alter table finance_entries enable row level security;

create policy "authenticated full access" on clients for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on cases for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on tasks for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on appointments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on finance_entries for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
