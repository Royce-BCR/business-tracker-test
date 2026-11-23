#!/usr/bin/env python3
"""Drives the local Postgres test: applies the Stage A/B files twice, then asks "who can do what" for every role x table x operation
and prints markdown tables. Uses fake users only. Nothing here can reach Supabase."""
import os, re, subprocess, sys

P = os.environ['P'].split(); HERE = os.environ['HERE']; SQL = os.environ['SQL']
ADMIN, MEMBER, INACTIVE, OUTSIDER = ('00000000-0000-4000-8000-0000000000%02d' % i for i in (1, 2, 3, 4))
ROLES = [('anon', None, None), ('signed in, not a member', OUTSIDER, 'Outsider'), ('inactive member', INACTIVE, 'Gone'), ('member', MEMBER, 'Lynton'), ('admin', ADMIN, 'Royce')]

def run(sql, check=True):
    r = subprocess.run(P + ['-At', '-c', sql], capture_output=True, text=True)
    if check and r.returncode != 0: print(r.stderr); sys.exit(1)
    return r

def runfile(path, label):
    r = subprocess.run(P + ['-f', path], capture_output=True, text=True)
    errs = [l for l in r.stderr.splitlines() if 'ERROR' in l]
    if r.returncode != 0 or errs: print('FAILED', label, r.stderr); sys.exit(1)

def attempt(role, uid, stmt):
    """one statement as one role, inside a transaction that is always rolled back; returns 'yes', 'no (denied)' or 'no (0 rows)'"""
    pg_role = 'anon' if role == 'anon' else 'authenticated'
    claim = "select set_config('request.jwt.claim.sub', '%s', true);" % uid if uid else ''
    r = subprocess.run(P + ['-At', '-c', "begin; set local role %s; %s %s; rollback;" % (pg_role, claim, stmt)], capture_output=True, text=True)
    err = r.stderr.strip()
    if err and 'relation "app_members" does not exist' in err: return 'n/a (not created yet)'
    if err and ('permission denied' in err or 'row-level security' in err or 'violates' in err or 'does not exist' in err): return 'no (denied)'
    if err: return 'ERROR ' + err[:80]
    out = [l for l in r.stdout.splitlines() if re.match(r'^-?\d+$', l.strip())]
    n = int(out[-1]) if out else 0
    return 'yes' if n > 0 else 'no (0 rows)'

def ops(role, name):
    forged = "'Someone Else'"; real = "'%s'" % (name or 'x')
    return {
      'tracker_data': [('select', "select count(*) from tracker_data where id = 2"),
                       ('insert', "with x as (insert into tracker_data (id, doc) values (1, '{}') on conflict do nothing returning 1) select count(*) from x"),
                       ('insert (new id 9)', "with x as (insert into tracker_data (id, doc) values (9, '{}') returning 1) select count(*) from x"),
                       ('update doc', "with x as (update tracker_data set doc = doc || '{\"k\":1}' where id = 2 returning 1) select count(*) from x"),
                       ('delete', "with x as (delete from tracker_data where id = 2 returning 1) select count(*) from x")],
      'tracker_snapshots': [('select', "select count(*) from tracker_snapshots"),
                       ('insert', "with x as (insert into tracker_snapshots (doc_id, doc) values (2, '{}') returning 1) select count(*) from x"),
                       ('update', "with x as (update tracker_snapshots set reason = 'x' returning 1) select count(*) from x"),
                       ('delete', "with x as (delete from tracker_snapshots returning 1) select count(*) from x")],
      'activity_log': [('select', "select count(*) from activity_log"),
                       ('insert (own name)', "with x as (insert into activity_log (id, doc_id, by, summary) values (gen_random_uuid(), 2, %s, 't') returning 1) select count(*) from x" % real),
                       ('insert (forged name)', "with x as (insert into activity_log (id, doc_id, by, summary) values (gen_random_uuid(), 2, %s, 't') returning 1) select count(*) from x" % forged),
                       ('insert, no RETURNING (exactly what the portal sends), own name', "do $$ begin insert into activity_log (id, doc_id, by, summary) values (gen_random_uuid(), 2, %s, 't'); end $$; select 1" % real),
                       ('insert, no RETURNING, forged name', "do $$ begin insert into activity_log (id, doc_id, by, summary) values (gen_random_uuid(), 2, %s, 't'); end $$; select 1" % forged),
                       ('insert (a stored id again, plain: the portal treats the 409 as "already stored")', "with x as (insert into activity_log (id, doc_id, by, summary) values ('11111111-1111-4111-8111-111111111111', 2, %s, 't') returning 1) select count(*) from x" % real),
                       ('insert (new id, ON CONFLICT DO NOTHING)', "with x as (insert into activity_log (id, doc_id, by, summary) values (gen_random_uuid(), 2, %s, 't') on conflict (id) do nothing returning 1) select count(*) from x" % real),
                       ('insert (stored id, ON CONFLICT DO NOTHING: why the portal does not use it)', "with x as (insert into activity_log (id, doc_id, by, summary) values ('11111111-1111-4111-8111-111111111111', 2, %s, 't') on conflict (id) do nothing returning 1) select count(*) from x" % real),
                       ('update', "with x as (update activity_log set summary = 'x' returning 1) select count(*) from x"),
                       ('delete', "with x as (delete from activity_log returning 1) select count(*) from x")],
      'app_members': [('select', "select count(*) from app_members"),
                       ('insert', "with x as (insert into app_members (user_id, email, display_name, role) values ('%s', 'n@example.invalid', 'N', 'admin') returning 1) select count(*) from x" % OUTSIDER),
                       ('update display_name', "with x as (update app_members set display_name = display_name || '' where user_id <> '%s' returning 1) select count(*) from x" % ADMIN),
                       ('update role', "with x as (update app_members set role = 'admin' returning 1) select count(*) from x"),
                       ('delete', "with x as (delete from app_members returning 1) select count(*) from x")],
    }

def seed():
    run("truncate activity_log; delete from tracker_snapshots;")
    if run("select to_regclass('public.app_members') is not null").stdout.strip() == 't': run("delete from app_members")
    run("insert into auth.users values ('%s','admin.example@example.invalid'),('%s','member1.example@example.invalid'),('%s','gone.example@example.invalid'),('%s','outsider.example@example.invalid') on conflict do nothing" % (ADMIN, MEMBER, INACTIVE, OUTSIDER))
    if run("select to_regclass('public.app_members') is not null").stdout.strip() == 't': run("insert into app_members (user_id, email, display_name, role, active) values ('%s','admin.example@example.invalid','Royce','admin',true),('%s','member1.example@example.invalid','Lynton','member',true),('%s','gone.example@example.invalid','Gone','member',false)" % (ADMIN, MEMBER, INACTIVE))
    run("insert into tracker_snapshots (doc_id, reason, doc) values (2, 'seed', '{}')")
    run("insert into activity_log (id, doc_id, by, summary) values ('11111111-1111-4111-8111-111111111111', 2, 'Lynton', 'seed')")
    run("update tracker_data set doc = doc where id = 1")   # nothing

def table(title):
    seed(); print('\n### %s\n' % title)
    cells = {}
    for role, uid, name in ROLES:
        for tbl, lst in ops(role, name).items():
            for op, stmt in lst: cells[(tbl, op, role)] = attempt(role, uid, stmt)
    for tbl in ['tracker_data', 'tracker_snapshots', 'activity_log', 'app_members']:
        opsn = [op for op, _ in ops(None, None)[tbl]]
        print('**%s**\n' % tbl); print('| operation | ' + ' | '.join(r[0] for r in ROLES) + ' |'); print('|---|' + '---|' * len(ROLES))
        for op in opsn: print('| %s | ' % op + ' | '.join(cells[(tbl, op, r[0])] for r in ROLES) + ' |')
        print()
    return cells

def funcs(title):
    print('\n**Functions: can anon / signed-in run them? (%s)**\n' % title); print('| function | anon | authenticated |'); print('|---|---|---|')
    for f in ['app_login(text,text)', 'app_list_users()', 'tracker_arr_len(jsonb,text)', 'tracker_data_before_update()', 'activity_log_retention()', 'is_member()', 'is_admin()', 'my_display_name()', 'app_whoami()']:
        a = run("select coalesce((select has_function_privilege('anon', to_regprocedure('public.%s'), 'execute')), null)" % f, check=False).stdout.strip() or 'n/a'
        b = run("select coalesce((select has_function_privilege('authenticated', to_regprocedure('public.%s'), 'execute')), null)" % f, check=False).stdout.strip() or 'n/a'
        print('| %s | %s | %s |' % (f, {'t': 'yes', 'f': 'no'}.get(a, a), {'t': 'yes', 'f': 'no'}.get(b, b)))

def cas_and_snapshot():
    print('\n**Save Safety under the policies, as a MEMBER (compare-and-swap + snapshot trigger)**\n')
    run("delete from tracker_snapshots where doc_id = 2; update tracker_data set doc = '{\"contacts\":[1,2,3,4,5,6,7,8,9,10]}' where id = 2")   # as owner: sets a known base (trigger snapshots it)
    v = int(run("select version from tracker_data where id = 2").stdout.strip())
    def member(stmt): return subprocess.run(P + ['-At', '-c', "begin; set local role authenticated; select set_config('request.jwt.claim.sub','%s', true); %s; commit;" % (MEMBER, stmt)], capture_output=True, text=True)
    r1 = member("update tracker_data set doc = '{\"contacts\":[1]}' where id = 2 and version = %d returning version" % v)
    r2 = member("update tracker_data set doc = '{\"contacts\":[2]}' where id = 2 and version = %d returning version" % v)   # stale version
    nver = int(run("select version from tracker_data where id = 2").stdout.strip())
    snaps = run("select count(*) from tracker_snapshots where doc_id = 2").stdout.strip(); why = run("select string_agg(reason, ',') from tracker_snapshots where doc_id = 2").stdout.strip()
    ok1 = ('%d' % (v + 1)) in r1.stdout; ok2 = r2.stdout.strip().replace('BEGIN','').replace('COMMIT','').replace('set_config','').strip() == '' or '%d' % (v + 1) not in r2.stdout.split('\n')[-3:].__str__()
    print('- member save with the current version %d: %s (version is now %d)' % (v, 'works' if ok1 else 'FAILED', nver))
    print('- member save with the stale version %d: %s' % (v, 'matched 0 rows (blocked, nothing overwritten)' if int(run("select count(*) from tracker_data where id = 2 and doc = '{\"contacts\":[2]}'").stdout.strip()) == 0 else 'OVERWROTE'))
    print('- the snapshot trigger still ran for the member\'s save: %s snapshot(s), reason(s) %s (a 10-to-1 shrink is snapshotted)' % (snaps, why))
    r3 = member("update tracker_data set id = 5 where id = 2"); print('- a member changing the row id: %s' % ('denied' if 'permission denied' in r3.stderr else 'ALLOWED'))
    r4 = member("insert into activity_log (id, doc_id, by, summary) values (gen_random_uuid(), 2, 'Royce', 'forged')"); print('- a member forging "by = Royce" in the activity log: %s' % ('blocked by the row check' if 'row-level security' in r4.stderr else 'ALLOWED'))
    r5 = member("insert into activity_log (id, doc_id, by, summary) values (gen_random_uuid(), 2, 'Lynton', 'genuine')"); print('- the same member writing as themselves: %s' % ('works' if r5.returncode == 0 and 'ERROR' not in r5.stderr else 'FAILED ' + r5.stderr[:80]))

print('# Local Postgres results (throwaway Postgres 16, stand-in anon / authenticated roles and auth.uid(); fake users only)')
table('BEFORE Stage S: how the live database is today (the baseline)')
for n in (1, 2):
    runfile(os.path.join(SQL, 'auth-stage-a.sql'), 'stage A run %d' % n)
print('\n**auth-stage-a.sql ran twice with no error.**')
table('AFTER Stage A (anon unchanged; members can use the portal)')
funcs('after Stage A'); cas_and_snapshot()
for n in (1, 2):
    runfile(os.path.join(SQL, 'auth-stage-b.sql'), 'stage B run %d' % n)
print('\n**auth-stage-b.sql ran twice with no error.**')
table('AFTER Stage B (the lockdown)')
funcs('after Stage B'); cas_and_snapshot()
# rollback: the commented paste at the bottom of Stage B
txt = open(os.path.join(SQL, 'auth-stage-b.sql')).read(); rb = txt[txt.index('-- ROLLBACK (one paste'):]
lines = []
for l in rb.splitlines()[1:]:
    if l.startswith('-- ====='): break
    m = re.match(r'^--   (.*)$', l)
    if m and not m.group(1).startswith(('Policies', 'Grants', 'Functions', 'Old users table:')): lines.append(m.group(1))
    elif m and m.group(1).startswith('Old users table:'): lines.append(m.group(1).split('--')[0].replace('Old users table: ', ''))
rbsql = '\n'.join(lines); open('/tmp/rollback_b.sql', 'w').write(rbsql); runfile('/tmp/rollback_b.sql', 'rollback')
print('\n**The ROLLBACK paste ran with no error.**')
after_rb = table('AFTER running the Stage B ROLLBACK (anon must be open again, as in Stage A)')
funcs('after rollback')
