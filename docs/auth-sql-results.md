# Local Postgres results (throwaway Postgres 16, stand-in anon / authenticated roles and auth.uid(); fake users only)

### BEFORE Stage S: how the live database is today (the baseline)

**tracker_data**

| operation | anon | signed in, not a member | inactive member | member | admin |
|---|---|---|---|---|---|
| select | yes | yes | yes | yes | yes |
| insert | no (0 rows) | no (0 rows) | no (0 rows) | no (0 rows) | no (0 rows) |
| insert (new id 9) | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| update doc | yes | yes | yes | yes | yes |
| delete | no (0 rows) | no (0 rows) | no (0 rows) | no (0 rows) | no (0 rows) |

**tracker_snapshots**

| operation | anon | signed in, not a member | inactive member | member | admin |
|---|---|---|---|---|---|
| select | yes | yes | yes | yes | yes |
| insert | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| update | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| delete | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |

**activity_log**

| operation | anon | signed in, not a member | inactive member | member | admin |
|---|---|---|---|---|---|
| select | yes | yes | yes | yes | yes |
| insert (own name) | yes | yes | yes | yes | yes |
| insert (forged name) | yes | yes | yes | yes | yes |
| insert, no RETURNING (exactly what the portal sends), own name | yes | yes | yes | yes | yes |
| insert, no RETURNING, forged name | yes | yes | yes | yes | yes |
| insert (a stored id again, plain: the portal treats the 409 as "already stored") | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| insert (new id, ON CONFLICT DO NOTHING) | yes | yes | yes | yes | yes |
| insert (stored id, ON CONFLICT DO NOTHING: why the portal does not use it) | no (0 rows) | no (0 rows) | no (0 rows) | no (0 rows) | no (0 rows) |
| update | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| delete | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |

**app_members**

| operation | anon | signed in, not a member | inactive member | member | admin |
|---|---|---|---|---|---|
| select | n/a (not created yet) | n/a (not created yet) | n/a (not created yet) | n/a (not created yet) | n/a (not created yet) |
| insert | n/a (not created yet) | n/a (not created yet) | n/a (not created yet) | n/a (not created yet) | n/a (not created yet) |
| update display_name | n/a (not created yet) | n/a (not created yet) | n/a (not created yet) | n/a (not created yet) | n/a (not created yet) |
| update role | n/a (not created yet) | n/a (not created yet) | n/a (not created yet) | n/a (not created yet) | n/a (not created yet) |
| delete | n/a (not created yet) | n/a (not created yet) | n/a (not created yet) | n/a (not created yet) | n/a (not created yet) |


**auth-stage-a.sql ran twice with no error.**

### AFTER Stage A (anon unchanged; members can use the portal)

**tracker_data**

| operation | anon | signed in, not a member | inactive member | member | admin |
|---|---|---|---|---|---|
| select | yes | no (0 rows) | no (0 rows) | yes | yes |
| insert | no (0 rows) | no (denied) | no (denied) | no (denied) | no (denied) |
| insert (new id 9) | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| update doc | yes | no (0 rows) | no (0 rows) | yes | yes |
| delete | no (0 rows) | no (denied) | no (denied) | no (denied) | no (denied) |

**tracker_snapshots**

| operation | anon | signed in, not a member | inactive member | member | admin |
|---|---|---|---|---|---|
| select | yes | no (0 rows) | no (0 rows) | no (0 rows) | yes |
| insert | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| update | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| delete | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |

**activity_log**

| operation | anon | signed in, not a member | inactive member | member | admin |
|---|---|---|---|---|---|
| select | yes | no (0 rows) | no (0 rows) | no (0 rows) | yes |
| insert (own name) | yes | no (denied) | no (denied) | yes | yes |
| insert (forged name) | yes | no (denied) | no (denied) | no (denied) | no (denied) |
| insert, no RETURNING (exactly what the portal sends), own name | yes | no (denied) | no (denied) | yes | yes |
| insert, no RETURNING, forged name | yes | no (denied) | no (denied) | no (denied) | no (denied) |
| insert (a stored id again, plain: the portal treats the 409 as "already stored") | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| insert (new id, ON CONFLICT DO NOTHING) | yes | no (denied) | no (denied) | no (denied) | yes |
| insert (stored id, ON CONFLICT DO NOTHING: why the portal does not use it) | no (0 rows) | no (denied) | no (denied) | no (denied) | no (0 rows) |
| update | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| delete | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |

**app_members**

| operation | anon | signed in, not a member | inactive member | member | admin |
|---|---|---|---|---|---|
| select | no (denied) | no (0 rows) | no (0 rows) | yes | yes |
| insert | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| update display_name | no (denied) | no (0 rows) | no (0 rows) | no (0 rows) | yes |
| update role | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| delete | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |


**Functions: can anon / signed-in run them? (after Stage A)**

| function | anon | authenticated |
|---|---|---|
| app_login(text,text) | yes | yes |
| app_list_users() | yes | yes |
| tracker_arr_len(jsonb,text) | yes | yes |
| tracker_data_before_update() | yes | yes |
| activity_log_retention() | yes | yes |
| is_member() | no | yes |
| is_admin() | no | yes |
| my_display_name() | no | yes |
| app_whoami() | no | yes |

**Save Safety under the policies, as a MEMBER (compare-and-swap + snapshot trigger)**

- member save with the current version 2: works (version is now 3)
- member save with the stale version 2: matched 0 rows (blocked, nothing overwritten)
- the snapshot trigger still ran for the member's save: 2 snapshot(s), reason(s) interval,shrink (a 10-to-1 shrink is snapshotted)
- a member changing the row id: denied
- a member forging "by = Royce" in the activity log: blocked by the row check
- the same member writing as themselves: works

**auth-stage-b.sql ran twice with no error.**

### AFTER Stage B (the lockdown)

**tracker_data**

| operation | anon | signed in, not a member | inactive member | member | admin |
|---|---|---|---|---|---|
| select | no (denied) | no (0 rows) | no (0 rows) | yes | yes |
| insert | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| insert (new id 9) | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| update doc | no (denied) | no (0 rows) | no (0 rows) | yes | yes |
| delete | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |

**tracker_snapshots**

| operation | anon | signed in, not a member | inactive member | member | admin |
|---|---|---|---|---|---|
| select | no (denied) | no (0 rows) | no (0 rows) | no (0 rows) | yes |
| insert | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| update | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| delete | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |

**activity_log**

| operation | anon | signed in, not a member | inactive member | member | admin |
|---|---|---|---|---|---|
| select | no (denied) | no (0 rows) | no (0 rows) | no (0 rows) | yes |
| insert (own name) | no (denied) | no (denied) | no (denied) | yes | yes |
| insert (forged name) | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| insert, no RETURNING (exactly what the portal sends), own name | no (denied) | no (denied) | no (denied) | yes | yes |
| insert, no RETURNING, forged name | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| insert (a stored id again, plain: the portal treats the 409 as "already stored") | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| insert (new id, ON CONFLICT DO NOTHING) | no (denied) | no (denied) | no (denied) | no (denied) | yes |
| insert (stored id, ON CONFLICT DO NOTHING: why the portal does not use it) | no (denied) | no (denied) | no (denied) | no (denied) | no (0 rows) |
| update | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| delete | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |

**app_members**

| operation | anon | signed in, not a member | inactive member | member | admin |
|---|---|---|---|---|---|
| select | no (denied) | no (0 rows) | no (0 rows) | yes | yes |
| insert | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| update display_name | no (denied) | no (0 rows) | no (0 rows) | no (0 rows) | yes |
| update role | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| delete | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |


**Functions: can anon / signed-in run them? (after Stage B)**

| function | anon | authenticated |
|---|---|---|
| app_login(text,text) | no | no |
| app_list_users() | no | no |
| tracker_arr_len(jsonb,text) | no | no |
| tracker_data_before_update() | no | no |
| activity_log_retention() | no | no |
| is_member() | no | yes |
| is_admin() | no | yes |
| my_display_name() | no | yes |
| app_whoami() | no | yes |

**Save Safety under the policies, as a MEMBER (compare-and-swap + snapshot trigger)**

- member save with the current version 4: works (version is now 5)
- member save with the stale version 4: matched 0 rows (blocked, nothing overwritten)
- the snapshot trigger still ran for the member's save: 2 snapshot(s), reason(s) interval,shrink (a 10-to-1 shrink is snapshotted)
- a member changing the row id: denied
- a member forging "by = Royce" in the activity log: blocked by the row check
- the same member writing as themselves: works

**The ROLLBACK paste ran with no error.**

### AFTER running the Stage B ROLLBACK (anon must be open again, as in Stage A)

**tracker_data**

| operation | anon | signed in, not a member | inactive member | member | admin |
|---|---|---|---|---|---|
| select | yes | yes | yes | yes | yes |
| insert | no (0 rows) | no (denied) | no (denied) | no (denied) | no (denied) |
| insert (new id 9) | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| update doc | yes | yes | yes | yes | yes |
| delete | no (0 rows) | no (denied) | no (denied) | no (denied) | no (denied) |

**tracker_snapshots**

| operation | anon | signed in, not a member | inactive member | member | admin |
|---|---|---|---|---|---|
| select | yes | yes | yes | yes | yes |
| insert | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| update | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| delete | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |

**activity_log**

| operation | anon | signed in, not a member | inactive member | member | admin |
|---|---|---|---|---|---|
| select | yes | yes | yes | yes | yes |
| insert (own name) | yes | yes | yes | yes | yes |
| insert (forged name) | yes | yes | yes | yes | yes |
| insert, no RETURNING (exactly what the portal sends), own name | yes | yes | yes | yes | yes |
| insert, no RETURNING, forged name | yes | yes | yes | yes | yes |
| insert (a stored id again, plain: the portal treats the 409 as "already stored") | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| insert (new id, ON CONFLICT DO NOTHING) | yes | yes | yes | yes | yes |
| insert (stored id, ON CONFLICT DO NOTHING: why the portal does not use it) | no (0 rows) | no (0 rows) | no (0 rows) | no (0 rows) | no (0 rows) |
| update | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| delete | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |

**app_members**

| operation | anon | signed in, not a member | inactive member | member | admin |
|---|---|---|---|---|---|
| select | no (denied) | no (0 rows) | no (0 rows) | yes | yes |
| insert | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| update display_name | no (denied) | no (0 rows) | no (0 rows) | no (0 rows) | yes |
| update role | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |
| delete | no (denied) | no (denied) | no (denied) | no (denied) | no (denied) |


**Functions: can anon / signed-in run them? (after rollback)**

| function | anon | authenticated |
|---|---|---|
| app_login(text,text) | yes | yes |
| app_list_users() | yes | yes |
| tracker_arr_len(jsonb,text) | yes | yes |
| tracker_data_before_update() | yes | yes |
| activity_log_retention() | yes | yes |
| is_member() | no | yes |
| is_admin() | no | yes |
| my_display_name() | no | yes |
| app_whoami() | no | yes |
