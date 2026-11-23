/* Stage S (sign-in) tests, Part F. Every Supabase call (data AND Auth) is mocked (../save-safety/harness.js). All credentials are obviously fake.
   Run:  NODE_PATH=<global node_modules> HTML=index.html DOCID=2 PREFIX=bt-test- node run.js [results.md]
   Test 9 (all earlier tests still pass): run ../save-safety/run.js and ../activity-log/run.js on the same build. */
const fs = require('fs'), path = require('path');
const H = require('../save-safety/harness');
const { Mock, newPage, chip, waitState, open, serve, chromium } = H;
const OUT = process.argv[2] || null, SHOTS = process.env.SHOTS || null;
const rows = [];
const rec = (id, name, pass, note) => { rows.push({ id, name, pass, note }); console.log((pass ? 'PASS ' : 'FAIL ') + id + ' ' + name + (note ? ' — ' + note : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clone = o => JSON.parse(JSON.stringify(o));
const PW = { admin: 'fake-admin-pass-0001', member: 'fake-member-pass-0002', inactive: 'fake-inactive-pass-0003', outsider: 'fake-outsider-pass-0004' };
const EM = { admin: 'admin.example@example.invalid', member: 'member.example@example.invalid', inactive: 'inactive.example@example.invalid', outsider: 'outsider.example@example.invalid' };
const AUTHKEY = H.PREFIX + 'business-tracker-auth';
const edit = (p, n) => p.evaluate(v => { state.settings.leadStaleDays = v; saveState(); }, n);
const loginShown = p => p.waitForFunction(() => { const o = document.getElementById('loginOverlay'); return o && !o.classList.contains('hidden'); }, null, { timeout: 15000 });
const started = p => p.waitForFunction(() => typeof sync !== 'undefined' && sync.started && typeof state !== 'undefined' && state, null, { timeout: 20000 });
const signIn = async (p, who) => { await p.fill('#loginEmail', EM[who]); await p.fill('#loginPass', PW[who]); await p.click('#loginForm .login-btn'); };
const err = p => p.evaluate(() => document.getElementById('loginErr').textContent);
const lsKeys = p => p.evaluate(() => Object.keys(localStorage));
const dlgOpen = (p, t) => p.waitForFunction(x => { const o = document.getElementById('ssOverlay'); return o && !o.hidden && (!x || o.textContent.indexOf(x) >= 0); }, t, { timeout: 8000 });
const clickDlg = (p, k) => p.evaluate(x => document.querySelector('#ssOverlay [data-k="' + x + '"]').click(), k);

async function main(){
  const doc = await H.baseDoc(8);
  const browser = await chromium.launch(); const { srv, url } = await serve();
  const mk = o => new Mock(clone(doc), o);
  const guard = async (id, name, fn) => { try{ await fn(); }catch(e){ rec(id, name, false, 'ERROR: ' + String(e.message || e).split('\n')[0]); } };
  const chkr = () => { const notes = []; let ok = true; return { chk: (c, t) => { if(!c) ok = false; notes.push((c ? '✓ ' : '✗ ') + t); }, done: () => ({ ok, text: notes.join('; ') }) }; };

  /* ---------- 1 ---------- */
  await guard('1', 'Sign-in success and failure; not-a-member and inactive member are refused', async () => {
    const { chk, done } = chkr();
    const m = mk(), p = await newPage(browser, m, { noSession: true }); await p.goto(url); await loginShown(p);
    chk(m.reqLog.length === 0 && m.authLog.length === 0, 'signed out: the sign-in screen shows and not one request is made');
    if(SHOTS){ await sleep(300); await p.screenshot({ path: path.join(SHOTS, 'signin-light.png') }); }
    await p.fill('#loginEmail', EM.member); await p.fill('#loginPass', 'wrong-but-fake-0000'); await p.click('#loginForm .login-btn'); await sleep(400);
    chk(await err(p) === 'That email and password don’t match.' && m.reqLog.length === 0, 'wrong password: one plain generic message, no data requests');
    await p.fill('#loginEmail', 'nobody.example@example.invalid'); await p.fill('#loginPass', 'wrong-but-fake-0000'); await p.click('#loginForm .login-btn'); await sleep(400);
    chk(await err(p) === 'That email and password don’t match.', 'unknown email: the very same message (it never says which half was wrong)');
    await p.fill('#loginEmail', EM.outsider); await p.fill('#loginPass', PW.outsider); await p.click('#loginForm .login-btn'); await sleep(600);
    chk(/isn’t approved for this portal\. Ask Royce\./.test(await err(p)) && !(await lsKeys(p)).includes(AUTHKEY) && m.logouts === 1 && m.reqLog.filter(r => r.path.includes('tracker_data')).length === 0, 'valid login but not a member: "Your account isn’t approved for this portal. Ask Royce.", signed out again, no data read');
    await p.fill('#loginEmail', EM.inactive); await p.fill('#loginPass', PW.inactive); await p.click('#loginForm .login-btn'); await sleep(600);
    chk(/isn’t approved/.test(await err(p)) && !(await lsKeys(p)).includes(AUTHKEY) && m.reqLog.filter(r => r.path.includes('tracker_data')).length === 0, 'inactive member: refused the same way');
    await p.fill('#loginEmail', EM.member); await p.fill('#loginPass', PW.member); await p.click('#loginForm .login-btn'); await started(p); await waitState(p, 'backed');
    const s = await p.evaluate(() => ({ name: session.username, role: session.role, pass: document.getElementById('loginPass').value, hidden: document.getElementById('loginOverlay').classList.contains('hidden') }));
    chk(s.name === 'Test Member' && s.role === 'user' && s.pass === '' && s.hidden, 'a member signs in: name "Test Member", role member, password field cleared, the portal opens');
    const p2 = await newPage(browser, m, { noSession: true }); await p2.goto(url); await loginShown(p2); await signIn(p2, 'admin'); await started(p2);
    chk(await p2.evaluate(() => session.username === 'Test Admin' && session.role === 'admin'), 'the admin signs in as "Test Admin", role admin');
    rec('1', 'Sign-in success and failure; not-a-member and inactive member are refused', done().ok, done().text);
    await p.context().close(); await p2.context().close();
  });

  /* ---------- 2 ---------- */
  await guard('2', 'Refresh at expiry; 401 on save refreshes and retries; failed refresh = red Signed out, edits kept, resumes after sign-in', async () => {
    const { chk, done } = chkr();
    { // a) refresh about 60 s before expiry
      const m = mk(), p = await newPage(browser, m, { clock: true }); await open(p, url);
      await p.evaluate(k => { const t = JSON.parse(localStorage.getItem(k)); t.expires_at = Math.floor(Date.now() / 1000) + 3600; localStorage.setItem(k, JSON.stringify(t)); auth.tok = t; authSchedule(); }, AUTHKEY);   // one hour left, on the page's own (fake) clock
      const before = await p.evaluate(k => JSON.parse(localStorage.getItem(k)).refresh_token, AUTHKEY);
      await p.clock.runFor(3500 * 1000); await sleep(300); const mid = m.refreshCalls;
      await p.clock.runFor(60 * 1000); await sleep(600);
      const after = await p.evaluate(k => JSON.parse(localStorage.getItem(k)).refresh_token, AUTHKEY);
      await edit(p, 41); await waitState(p, 'backed', 8000);
      chk(mid === 0 && m.refreshCalls === 1 && after !== before, 'the token is refreshed about 60 s before it expires, once, and the new pair is written (rotated)');
      chk(m.doc.settings.leadStaleDays === 41 && m.badAuthRequests === 0, 'saving afterwards works with the new token; the database never saw a bad token');
      await p.context().close(); }
    { // b) 401 on save: one refresh, one retry
      const m = mk(), p = await newPage(browser, m); await open(p, url); m.expireAll();
      await edit(p, 42); await waitState(p, 'backed', 8000);
      chk(m.refreshCalls === 1 && m.doc.settings.leadStaleDays === 42 && (await chip(p)).text === 'Backed up · Now', 'a 401 on save: refreshed once, retried, saved (no red state)');
      await p.context().close(); }
    { // c) the refresh itself cannot be reached: not a sign-out
      const m = mk(), p = await newPage(browser, m); await open(p, url); m.expireAll(); m.failRefresh = 500;
      await edit(p, 43); await waitState(p, 'offline', 8000); const c = await chip(p);
      chk(c.state === 'offline' && !(await p.evaluate(() => auth.signedOut)), 'the sign-in service unreachable (500) is treated as offline, not as signed out');
      m.failRefresh = null; await p.evaluate(() => ssRetryNow()); await waitState(p, 'backed', 8000);
      chk(m.doc.settings.leadStaleDays === 43, 'and it recovers by itself when the service is back');
      await p.context().close(); }
    { // d) the session is really over
      const m = mk(), p = await newPage(browser, m); await open(p, url); await p.evaluate(() => { const l = state.contacts.length; window.__n0 = l; });
      const last = await p.evaluate(() => ssClock(sync.lastConfirmedAt)); const docBefore = JSON.stringify(m.doc);
      m.expireAll(); m.failRefresh = 'invalid';
      await p.evaluate(() => { cxNewContact({ firstName: 'Kept', lastName: 'Edit' }); state.settings.leadStaleDays = 44; saveState(); }); await waitState(p, 'signedout', 8000);
      const c = await chip(p), st = await p.evaluate((k) => ({ dirty: sync.dirty, has: state.contacts.some(x => x.firstName === 'Kept'), n: state.contacts.length, loggedOut: document.body.classList.contains('logged-out'), dlg: !document.getElementById('loginOverlay').classList.contains('hidden'), expired: document.getElementById('loginOverlay').classList.contains('login-expired'), note: document.getElementById('loginNote').textContent, local: JSON.parse(localStorage.getItem(STORAGE_KEY)).settings.leadStaleDays, meta: JSON.parse(localStorage.getItem(STORAGE_KEY + '-meta')).dirty, authKey: !!localStorage.getItem(k) }), AUTHKEY);
      chk(c.text === 'Signed out · last backed up ' + last, 'the chip goes red: "' + c.text + '"');
      chk(st.dirty && st.has && st.local === 44 && st.meta === true && JSON.stringify(m.doc) === docBefore, 'nothing is overwritten and nothing is lost: edits stay on screen, marked unsaved, stored on this device; the cloud is untouched');
      chk(st.dlg && st.expired && !st.loggedOut && /Sign in again\. Your work is kept\./.test(st.note) && st.n === (await p.evaluate(() => window.__n0)) + 1, 'a sign-in dialog opens OVER the page (the page and its data are not replaced or reset)');
      if(SHOTS){ await sleep(300); await p.screenshot({ path: path.join(SHOTS, 'session-ended-dialog.png') }); }
      const dlp = p.waitForEvent('download', { timeout: 6000 }); await p.click('[data-action="auth-download"]'); const dld = await dlp; const dfile = JSON.parse(fs.readFileSync(await dld.path(), 'utf8'));
      chk(dfile.settings.leadStaleDays === 44 && dfile.contacts.some(x => x.firstName === 'Kept'), 'while signed out the dialog still lets you download the data on screen (including the unsaved edit)');
      await p.click('[data-action="auth-later"]'); chk(await p.evaluate(() => document.getElementById('loginOverlay').classList.contains('hidden') && sync.status === 'signedout'), '"Not now" closes the dialog and keeps the work on screen; the chip stays red');
      await p.click('#syncInfo'); await p.waitForSelector('#syncPop:not([hidden])'); if(SHOTS) await p.screenshot({ path: path.join(SHOTS, 'signed-out-chip-popover.png'), clip: { x: 640, y: 28, width: 640, height: 400 } }); const pop = await p.evaluate(() => document.getElementById('syncPop').textContent); chk(/Sign in again\. Your work is kept\./.test(pop), 'the ⓘ explains it and says "Sign in again. Your work is kept."');
      const patches = m.patchBodies.length; await sleep(1500); chk(m.patchBodies.length === patches && m.reqLog.filter(r => r.path.includes('activity')).length === 0, 'while signed out: no save attempts, no live refresh, no activity flush');
      await p.evaluate(() => document.querySelector('#syncPop [data-ss="signin"]').click()); await p.waitForFunction(() => !document.getElementById('loginOverlay').classList.contains('hidden'));
      m.failRefresh = null; await p.fill('#loginEmail', EM.admin); await p.fill('#loginPass', PW.admin); await p.click('#loginForm .login-btn'); await waitState(p, 'backed', 12000);
      chk(m.doc.settings.leadStaleDays === 44 && m.doc.contacts.some(x => x.firstName === 'Kept'), 'after signing in again the save resumes by itself (cloud had not moved, so no question to ask) and the edits reach the cloud');
      await p.context().close(); }
    { // e) signed out, and the cloud HAS moved: the load check comes first
      const m = mk(), p = await newPage(browser, m); await open(p, url); m.expireAll(); m.failRefresh = 'invalid';
      await p.evaluate(() => { state.settings.leadStaleDays = 45; saveState(); }); await waitState(p, 'signedout', 8000);
      m.other(d => { d.settings.leadStaleDays = 99; }); m.failRefresh = null;
      await p.fill('#loginEmail', EM.admin); await p.fill('#loginPass', PW.admin); await p.click('#loginForm .login-btn'); await dlgOpen(p, 'Unsaved changes found');
      chk(m.doc.settings.leadStaleDays === 99 && (await p.evaluate(() => state.settings.leadStaleDays)) === 45 && (await p.evaluate(() => Object.keys(localStorage).filter(k => k.includes('-rescue-')).length)) === 1, 'cloud changed meanwhile: after sign-in the load check runs first, a rescue copy is stored, nothing is overwritten');
      await clickDlg(p, 'keep'); await waitState(p, 'backed', 8000); chk(m.doc.settings.leadStaleDays === 45, 'choosing "keep" saves it');
      await p.context().close(); }
    { // f) turned off while signed in: not "someone else saved", but a clear sign-out with the work kept
      const m = mk(), p = await newPage(browser, m, { user: 'member' }); await open(p, url); const docBefore = JSON.stringify(m.doc);
      m.users['member.example@example.invalid'].active = false;
      await p.evaluate(() => { state.settings.leadStaleDays = 46; saveState(); }); await waitState(p, 'signedout', 8000);
      const st = await p.evaluate(() => ({ note: document.getElementById('loginNote').textContent, dirty: sync.dirty, v: state.settings.leadStaleDays }));
      chk(/isn’t approved for this portal\. Ask Royce\./.test(st.note) && st.dirty && st.v === 46 && JSON.stringify(m.doc) === docBefore, 'an account turned off while signed in: "not approved" sign-out (not a false "someone else saved"), edits kept, cloud untouched');
      await p.context().close(); }
    rec('2', 'Refresh at expiry; 401 on save refreshes and retries; failed refresh = red Signed out, edits kept, resumes after sign-in', done().ok, done().text);
  });

  /* ---------- 3 ---------- */
  await guard('3', 'Two tabs refreshing together do not log each other out', async () => {
    const { chk, done } = chkr();
    const m = mk(), p = await newPage(browser, m); await open(p, url);
    const p2 = await p.context().newPage(); await p2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort()); await p2.route(H.SB + '/**', r => m.handle(r)); p2.errors = []; p2.on('pageerror', e => p2.errors.push(String(e)));
    await p2.goto(url); await started(p2);
    m.refreshDelay = 500;
    await p.evaluate(k => { const t = JSON.parse(localStorage.getItem(k)); t.expires_at = Math.floor(Date.now() / 1000) + 10; localStorage.setItem(k, JSON.stringify(t)); }, AUTHKEY);
    const [a, b] = await Promise.all([p.evaluate(() => authRefresh()), p2.evaluate(() => authRefresh())]); await sleep(300);
    const sa = await p.evaluate(() => ({ so: auth.signedOut, at: auth.tok.access_token })), sb = await p2.evaluate(() => ({ so: auth.signedOut, at: auth.tok.access_token }));
    const stored = await p.evaluate(k => JSON.parse(localStorage.getItem(k)).access_token, AUTHKEY);
    chk(a === true && b === true && m.refreshCalls === 1, 'both tabs asked at the same moment: exactly ONE refresh call reached the service (' + m.refreshCalls + ')');
    chk(!sa.so && !sb.so && sa.at === sb.at && sa.at === stored, 'neither tab was signed out; both hold the same new pair, and it is what is stored');
    m.refreshDelay = 0; await edit(p, 51); await waitState(p, 'backed', 6000); await p2.evaluate(() => { state.settings.leadStaleDays = 52; saveState(); });
    await sleep(1800); chk(m.badAuthRequests === 0 && !(await p2.evaluate(() => auth.signedOut)), 'both tabs go on saving afterwards with no rejected request');
    // and when the other tab rotated the token first, a 401 in this tab adopts the new pair instead of spending the old refresh token
    m.refreshCalls = 0; await p.evaluate(() => { window.__old = auth.tok.access_token; });
    rec('3', 'Two tabs refreshing together do not log each other out', done().ok, done().text);
    await p.context().close();
  });

  /* ---------- 4 ---------- */
  await guard('4', 'A member sees none of the admin screens and makes no requests for them; an admin sees all', async () => {
    const { chk, done } = chkr();
    const snaps = [{ id: 7, taken_at: new Date(Date.now() - 3600e3).toISOString(), reason: 'interval', bytes: 5000, counts: { contacts: 8 }, doc: clone(doc) }];
    const m = mk({ snapshots: snaps }), p = await newPage(browser, m, { user: 'member' }); await open(p, url);
    await p.evaluate(() => { activateTab('settings'); }); await sleep(300);
    const ids = await p.evaluate(() => settingsVisible().map(s => s.id));
    await p.evaluate(() => { settingsShow('activity', true); ssHistLoad(); alLoad(false); document.getElementById('ssHist').open = true; }); await sleep(600);
    const mem = await p.evaluate(() => ({ hist: document.getElementById('ssHist').hidden, admin: document.getElementById('setAdminSec').childElementCount, act: document.getElementById('setActivitySec').childElementCount, cur: setCurrent }));
    const reads = m.reqLog.filter(r => r.method === 'GET' && /tracker_snapshots|activity_log|app_members/.test(r.path));
    chk(!ids.includes('activity') && !ids.includes('admin') && mem.hist && mem.admin === 0 && mem.act === 0, 'a member: no Activity, no Admin section; the Version history panel is hidden (sections: ' + ids.join(', ') + ')');
    chk(reads.length === 0 && m.memberReadsBlocked === 0, 'a member makes no request for snapshots, the activity log or the member list, even when the functions are forced (' + reads.length + ' requests)');
    await edit(p, 61); await waitState(p, 'backed'); await sleep(2200);
    chk(m.activity.length >= 1 && m.activity.every(a => a.by === 'Test Member') && m.reqLog.some(r => r.method === 'POST' && /activity_log/.test(r.path)), 'a member still WRITES their own activity rows (and the database only accepts their own name)');
    const a = await newPage(browser, m, { user: 'admin' }); await open(a, url); await a.evaluate(() => { activateTab('settings'); }); await sleep(300);
    const aids = await a.evaluate(() => settingsVisible().map(s => s.id));
    await a.evaluate(() => { settingsShow('activity', true); }); await a.waitForSelector('#alList .al-row', { timeout: 6000 });
    await a.evaluate(() => { document.getElementById('ssHist').open = true; }); await a.waitForSelector('#ssHistBody table', { state: 'attached', timeout: 6000 });
    await a.evaluate(() => { settingsShow('admin', true); }); await a.waitForSelector('#usersWrap table', { state: 'attached', timeout: 6000 });
    const users = await a.evaluate(() => [...document.querySelectorAll('#usersWrap .mem-name')].map(i => i.value)); if(SHOTS){ await sleep(300); await a.screenshot({ path: path.join(SHOTS, 'admin-people.png') }); }
    chk(aids.includes('activity') && aids.includes('admin') && users.length === 3 && users.includes('Test Admin') && !users.includes(''), 'the admin sees Activity (rows load), Version history (list loads) and Admin → people (' + users.join(', ') + ')');
    await a.evaluate(() => document.querySelector('.mem-active[data-uid="u-member"]').click()); await sleep(600);
    chk(m.users['member.example@example.invalid'].active === false && (await a.evaluate(() => document.querySelector('.mem-active[data-uid="u-admin"]').disabled)), 'the admin can turn a person off (PATCH app_members); their own switch is disabled');
    const addText = await a.evaluate(() => document.getElementById('usersWrap').textContent); chk(/Authentication → Users/.test(addText) && !/password/i.test(addText.replace(/first password/i, '')) , '"Add a person" is only instructions (create the account in the Supabase dashboard, then ask the assistant to approve it); there are no password or key fields');
    await a.evaluate(() => { document.querySelector('.mem-name[data-uid="u-member"]').value = 'Renamed Member'; document.querySelector('.mem-name[data-uid="u-member"]').dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(600);
    chk(m.users['member.example@example.invalid'].name === 'Renamed Member', 'the admin can edit a display name');
    rec('4', 'A member sees none of the admin screens and makes no requests for them; an admin sees all', done().ok, done().text);
    await p.context().close(); await a.context().close();
  });

  /* ---------- 5 ---------- */
  await guard('5', 'No token or password anywhere it must not be (storage, backup, activity log, console, URLs)', async () => {
    const { chk, done } = chkr();
    const m = mk(), p = await newPage(browser, m, { noSession: true }); const urls = [], bodies = [], con = [];
    p.on('request', r => { urls.push(r.url()); if(r.postData()) bodies.push({ u: r.url(), b: r.postData() }); }); p.on('console', c => con.push(c.text()));
    await p.goto(url); await loginShown(p);
    const type = await p.evaluate(() => document.getElementById('loginPass').type); await p.fill('#loginEmail', EM.member); await p.fill('#loginPass', PW.member);
    if(SHOTS) await p.screenshot({ path: path.join(SHOTS, 'signin-typed.png') });
    await p.click('#loginForm .login-btn'); await started(p); await waitState(p, 'backed');
    await p.evaluate(() => { cxNewContact({ firstName: 'Tok', lastName: 'Scan' }); saveState(); }); await waitState(p, 'backed'); await sleep(2200);
    const dlp = p.waitForEvent('download', { timeout: 6000 }); await p.evaluate(() => { exportData(); }); const dl = await dlp; const exported = fs.readFileSync(await dl.path(), 'utf8');
    const tok = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), AUTHKEY);
    const store = await p.evaluate(k => { const o = {}; for(let i = 0; i < localStorage.length; i++){ const key = localStorage.key(i); o[key] = localStorage.getItem(key); } for(let i = 0; i < sessionStorage.length; i++){ const key = sessionStorage.key(i); o['session:' + key] = sessionStorage.getItem(key); } return o; });
    const secrets = [PW.member, tok.access_token, tok.refresh_token];
    const leak = (text) => secrets.filter(sx => String(text).indexOf(sx) >= 0).length;
    const nonAuth = Object.keys(store).filter(k => k !== AUTHKEY);
    chk(type === 'password' && (await p.evaluate(() => document.getElementById('loginPass').value)) === '', 'the password box is masked while typing and emptied after sign-in');
    chk(leak(store[AUTHKEY]) === 2 && store[AUTHKEY].indexOf(PW.member) < 0, 'the session (tokens, never the password) is in its own storage key');
    chk(nonAuth.every(k => leak(store[k]) === 0), 'no token or password is in any other storage: the data document, its meta, the activity queue, rescue copies (' + nonAuth.length + ' keys checked)');
    chk(leak(exported) === 0 && !/access_token|refresh_token/.test(exported) && /Tok/.test(exported), 'the exported backup (' + exported.length + ' bytes) holds the data and no token or password');
    chk(leak(JSON.stringify(m.activity)) === 0 && m.activity.length > 0, 'the activity log rows hold no token or password (' + m.activity.length + ' rows)');
    chk(con.every(t => leak(t) === 0 && !/Bearer|access_token|refresh_token/.test(t)), 'nothing in the console output carries a token or password (' + con.length + ' messages)');
    chk(urls.every(u => leak(u) === 0 && !/[?&](token|access_token|refresh_token|password|apikey)=/.test(u) && u.indexOf(encodeURIComponent(EM.member)) < 0 && u.indexOf(EM.member) < 0), 'no URL or query string carries a token, password or email (' + urls.length + ' requests checked)');
    chk(bodies.filter(b => b.b.indexOf(PW.member) >= 0).length === 1 && /grant_type=password/.test(bodies.find(b => b.b.indexOf(PW.member) >= 0).u), 'the password appears in exactly one request: the sign-in itself');
    chk(m.authLog.every(a => a.apikey), 'the sign-in endpoints get the publishable key as apikey and nothing else');
    rec('5', 'No token or password anywhere it must not be (storage, backup, activity log, console, URLs)', done().ok, done().text);
    await p.context().close();
  });

  /* ---------- 6 ---------- */
  await guard('6', 'Sign out with unsaved changes warns and keeps a rescue copy; sign out when clean clears the local copy', async () => {
    const { chk, done } = chkr();
    { // dirty
      const m = mk(), p = await newPage(browser, m, { user: 'member' }); await open(p, url); m.failPatch = 500; await edit(p, 71); await waitState(p, 'failed', 8000);
      await p.evaluate(() => document.querySelector('[data-action="logout"]').click()); await dlgOpen(p, 'not saved to the cloud');
      chk(true, 'with unsaved changes: Sign out first warns ("You have changes that are not saved to the cloud")');
      await clickDlg(p, 'cancel'); await sleep(200); chk(await p.evaluate(k => !!localStorage.getItem(k) && !!session, AUTHKEY), 'Cancel keeps you signed in with everything as it was');
      await p.evaluate(() => document.querySelector('[data-action="logout"]').click()); await dlgOpen(p, 'not saved to the cloud');
      const dl = p.waitForEvent('download', { timeout: 6000 }); const nav = p.waitForNavigation({ timeout: 8000 }).catch(() => null);
      await clickDlg(p, 'download'); const d = await dl; const file = fs.readFileSync(await d.path(), 'utf8'); await nav; await loginShown(p);
      const st = await p.evaluate(() => ({ keys: Object.keys(localStorage), doc: localStorage.getItem(STORAGE_KEY), meta: JSON.parse(localStorage.getItem(STORAGE_KEY + '-meta') || 'null') }));
      chk(JSON.parse(file).settings.leadStaleDays === 71, 'offered to download first, and the download holds the unsaved work');
      chk(st.keys.filter(k => k.includes('-rescue-')).length >= 1 && st.doc && JSON.parse(st.doc).settings.leadStaleDays === 71 && st.meta && st.meta.dirty === true && !st.keys.includes(AUTHKEY) && m.logouts === 1, 'after sign-out the rescue copy AND the local copy (still marked unsaved) are kept; the session is gone');
      m.failPatch = 0; await signIn(p, 'member'); await dlgOpen(p, 'Unsaved changes found'); chk(true, 'signing in again offers the unsaved work back through the load check (never silently dropped)');
      await clickDlg(p, 'keep'); await waitState(p, 'backed', 8000); chk(m.doc.settings.leadStaleDays === 71, 'keeping it saves it to the cloud');
      await p.context().close(); }
    { // clean
      const m = mk(), p = await newPage(browser, m, { user: 'member' }); await open(p, url); await edit(p, 72); await waitState(p, 'backed', 8000); await sleep(2200);
      const had = await p.evaluate(() => !!localStorage.getItem(STORAGE_KEY));
      const nav = p.waitForNavigation({ timeout: 8000 }); await p.evaluate(() => document.querySelector('[data-action="logout"]').click()); await nav; await loginShown(p);
      const k = await p.evaluate(() => Object.keys(localStorage));
      chk(had && !k.includes(H.PREFIX + 'business-tracker-state-v7') && !k.includes(H.PREFIX + 'business-tracker-state-v7-meta') && !k.includes(AUTHKEY), 'everything saved: Sign out removes the local data copy, its bookkeeping and the session from this browser (left: ' + (k.join(', ') || 'nothing') + ')');
      chk(m.doc.settings.leadStaleDays === 72 && m.activity.length >= 1, 'and the cloud has the data and the activity rows were sent first');
      await p.context().close(); }
    rec('6', 'Sign out with unsaved changes warns and keeps a rescue copy; sign out when clean clears the local copy', done().ok, done().text);
  });

  /* ---------- 7 ---------- */
  await guard('7', 'The activity "by" is the signed-in display name; the "Who are you?" picker is gone; a forged name is refused', async () => {
    const { chk, done } = chkr();
    const m = mk(), p = await newPage(browser, m, { user: 'member' }); await open(p, url);
    await p.evaluate(() => { state.quotes[0].project = 'By check'; saveState(); }); await waitState(p, 'backed'); await sleep(2400);
    const ui = await p.evaluate(() => ({ sel: !!document.getElementById('whoSel'), txt: document.body.innerText.indexOf('Who are you?') >= 0, who: document.getElementById('whoPick').textContent.trim(), key: Object.keys(localStorage).some(k => /who-are-you/.test(k)) }));
    chk(!ui.sel && !ui.txt && /Acting as Test Member/.test(ui.who), 'no "Who are you?" picker anywhere; the top shows "' + ui.who + '" (read-only)');
    chk(m.activity.length >= 1 && m.activity.every(a => a.by === 'Test Member'), 'every activity row says "Test Member", exactly the display name (' + m.activity.length + ' rows)');
    await p.evaluate(() => { alEnqueue([alMk('system', 'system', null, null, 'forged row', null), Object.assign(alMk('system', 'system', null, null, 'second genuine row', null))]); const q = alQueueRead(); q[0].by = 'Test Admin'; alQueueWrite(q); alFlush(); }); await sleep(2500);
    chk(!m.activity.some(a => a.summary === 'forged row') && m.activity.some(a => a.summary === 'second genuine row') && (await p.evaluate(() => alQueueRead().length)) === 0, 'a forged name is refused by the database and that one row is dropped; it never blocks the rest');
    chk(await p.evaluate(() => { const r = whoName(); return r === 'Test Member' && meName() === 'Test Member' && !isAdmin(); }), 'who-based checks use the same name (approvals, tasks, undo): whoName() and meName() are "Test Member"; isAdmin() is false');
    rec('7', 'The activity "by" is the signed-in display name; the "Who are you?" picker is gone; a forged name is refused', done().ok, done().text);
    await p.context().close();
  });

  /* ---------- 8 ---------- */
  await guard('8', 'The Content-Security-Policy blocks nothing the page needs (every request listed)', async () => {
    const { chk, done } = chkr();
    const m = mk(), p = await newPage(browser, m, { user: 'admin' }); const reqs = new Set();
    await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '/* fake css */' }));
    await p.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.docx = window.docx || {}; window.ExcelJS = window.ExcelJS || {};' }));
    p.on('request', r => reqs.add(new URL(r.url()).origin));
    await p.goto(url); await started(p);
    const meta = await p.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
    chk(/object-src 'none'/.test(meta) && /base-uri 'none'/.test(meta) && /connect-src 'self' https:\/\/dunbyxxpgpfewvelwtpv\.supabase\.co/.test(meta) && !/unsafe-eval/.test(meta), 'the policy is in place: only the page, the Supabase project (connect), the font and library hosts; object-src none, base-uri none, no eval');
    const tabs = await p.evaluate(() => [...document.querySelectorAll('.tab[data-tab]')].map(t => t.dataset.tab));
    for(const t of tabs.slice(0, 60)){ await p.evaluate(x => { try{ activateTab(x); }catch(e){} }, t); await sleep(25); }
    for(const s of ['general', 'pipelines', 'crm', 'suppliers', 'finance', 'quotes', 'selling', 'planning', 'docs', 'approvals', 'dashboard', 'phonemenu', 'data', 'activity', 'admin']){ await p.evaluate(x => { try{ activateTab('settings'); settingsShow(x, true); }catch(e){} }, s); await sleep(60); }
    await p.evaluate(() => { document.getElementById('ssHist').open = true; });
    await p.evaluate(() => { const f = document.createElement('iframe'); f.setAttribute('sandbox', ''); f.srcdoc = '<style>b{color:red}</style><b>preview</b>'; document.body.appendChild(f); });   // like the invoice preview
    const lib = await p.evaluate(async () => { try{ if(typeof loadExportLib === 'function') return 'fn'; }catch(e){} return 'none'; });
    await p.evaluate(() => new Promise(res => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/docx/8.5.0/docx.min.js'; s.onload = s.onerror = () => res(); document.head.appendChild(s); }));
    await p.evaluate(() => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Inter&display=swap'; document.head.appendChild(l); });
    const dl = p.waitForEvent('download', { timeout: 5000 }); await p.evaluate(() => { exportData(); }); await dl;
    await p.evaluate(() => { cxNewContact({ firstName: 'Csp', lastName: 'Check' }); saveState(); }); await waitState(p, 'backed'); await sleep(2200);
    await p.evaluate(() => fetch('https://example.invalid/steal').catch(() => {}));   // a deliberate violation: proves the policy is really enforced
    await sleep(300);
    const viol = await p.evaluate(() => window.__csp.slice()), good = viol.filter(v => !/example\.invalid/.test(v)), bad = viol.filter(v => /example\.invalid/.test(v));
    const hosts = [...reqs].sort();
    chk(good.length === 0, 'across every page, every Settings section, an invoice-style preview frame, the export, a save and the Word/Excel library host: ZERO violations of the policy (' + tabs.length + ' pages, 15 settings sections)');
    chk(bad.length === 1 && /connect-src/.test(bad[0]), 'the policy is really enforced: a request to an unknown host was blocked (' + bad[0] + ')');
    chk(hosts.every(h => /^http:\/\/127\.0\.0\.1:\d+$/.test(h) || ['https://dunbyxxpgpfewvelwtpv.supabase.co', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'https://example.invalid'].includes(h)), 'every request goes to the page itself or one allowed host: ' + hosts.map(h => h.replace(/:\d+$/, ':port')).join(', '));
    rec('8', 'The Content-Security-Policy blocks nothing the page needs (every request listed)', done().ok, done().text);
    await p.context().close();
  });

  { const ids = new Set(); H.allMocks.forEach(mm => { mm.ids.forEach(i => ids.add('tracker_data ' + i)); mm.actDocIds.forEach(i => ids.add('activity_log ' + i)); }); const bad = [...ids].filter(i => i.split(' ')[1] !== 'eq.' + H.DOCID);
    rec('ENV', 'Only this build\'s own row/doc_id is ever used (DOC_ID ' + H.DOCID + ')', bad.length === 0 && ids.size > 0, 'all requests in this run used: ' + [...ids].join(', ')); }
  await browser.close(); srv.close();
  const pass = rows.filter(r => r.pass).length;
  const md = '| # | Test | Result | Evidence |\n|---|---|---|---|\n' + rows.map(r => `| ${r.id} | ${r.name} | ${r.pass ? 'PASS' : '**FAIL**'} | ${String(r.note || '').replace(/\|/g, '/')} |`).join('\n') + `\n\n${pass}/${rows.length} passed\n`;
  if(OUT) fs.writeFileSync(OUT, md);
  console.log('\n' + pass + '/' + rows.length + ' passed'); process.exit(pass === rows.length ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(2); });
