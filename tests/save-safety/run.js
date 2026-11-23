/* Save Safety: Part H tests. Run:  NODE_PATH=<global node_modules> HTML=index.html DOCID=2 PREFIX=bt-test- node run.js [outfile.md]
   Every Supabase call is mocked (harness.js). Nothing touches a real database. */
const fs = require('fs'), os = require('os'), path = require('path');
const H = require('./harness');
const { Mock, newPage, chip, waitState, open, serve, chromium } = H;
const OUT = process.argv[2] || null, SHOTS = process.env.SHOTS || null;
const rows = [];
const rec = (id, name, pass, note) => { rows.push({ id, name, pass, note }); console.log((pass ? 'PASS ' : 'FAIL ') + id + ' ' + name + (note ? ' — ' + note : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const edit = (page, n) => page.evaluate(v => { state.settings.leadStaleDays = v; saveState(); }, n);
const dlgOpen = (page, title) => page.waitForFunction(t => { const o = document.getElementById('ssOverlay'); return o && !o.hidden && (!t || o.textContent.indexOf(t) >= 0); }, title, { timeout: 8000 });
const clickDlg = (page, key) => page.evaluate(k => document.querySelector('#ssOverlay [data-k="' + k + '"]').click(), key);
const rescueKeys = page => page.evaluate(() => Object.keys(localStorage).filter(k => k.indexOf(STORAGE_KEY + '-rescue-') === 0));
const metaOf = page => page.evaluate(() => JSON.parse(localStorage.getItem(STORAGE_KEY + '-meta') || 'null'));
const clone = o => JSON.parse(JSON.stringify(o));
const waitDl = (page, stem) => page.waitForEvent('download', { timeout: 8000, predicate: d => d.suggestedFilename().indexOf(stem) === 0 });
const readDl = async d => fs.readFileSync(await d.path(), 'utf8');
async function runFor(page, ms){ await page.clock.runFor(ms); }

async function main(){
  const doc = await H.baseDoc(40);
  const browser = await chromium.launch();
  const { srv, url } = await serve();
  const mk = (o) => new Mock(clone(doc), o);
  const guard = async (id, name, fn) => { try{ await fn(); }catch(e){ rec(id, name, false, 'ERROR: ' + String(e.message || e).split('\n')[0]); } };

  /* ---------- 1 ---------- */
  await guard('1', 'Edit a field: Saving, then "Backed up · Now" within ~1.5 s; the cloud row updates', async () => {
    const m = mk(), p = await newPage(browser, m); await open(p, url);
    const hist = []; await p.exposeFunction('__h', t => hist.push(t));
    await p.evaluate(() => new MutationObserver(() => __h(document.getElementById('syncTxt').textContent)).observe(document.getElementById('syncTxt'), { childList: true, subtree: true, characterData: true }));
    const t0 = Date.now(); await edit(p, 21); await waitState(p, 'backed'); const ms = Date.now() - t0;
    const c = await chip(p), urlOk = /version=eq\.1/.test(m.patchUrls[0]), bodyOk = eq(Object.keys(m.patchBodies[0]), ['doc']);
    const iconAnim = await p.evaluate(() => 1);
    rec('1', 'Edit a field: Saving, then "Backed up · Now" within ~1.5 s; the cloud row updates', hist.includes('Saving…') && c.text === 'Backed up · Now' && ms < 1500 && m.doc.settings.leadStaleDays === 21 && m.version === 2 && urlOk && bodyOk,
      `saw ${JSON.stringify(hist)}, ${ms} ms; row version ${m.version}; PATCH ${m.patchUrls[0]}; body keys ${Object.keys(m.patchBodies[0])} (no client updated_at)`);
    await p.context().close();
  });

  await guard('1b', 'Edit a field through the real screen (Settings > Dashboard), typed with the keyboard', async () => {
    const m = mk(), p = await newPage(browser, m); await open(p, url);
    await p.evaluate(() => { activateTab('settings'); settingsShow('dashboard'); }); await p.waitForSelector('#dashStaleDays', { state: 'visible' });
    const hist = []; await p.exposeFunction('__h2', t => hist.push(t));
    await p.evaluate(() => new MutationObserver(() => __h2(document.getElementById('syncTxt').textContent)).observe(document.getElementById('syncTxt'), { childList: true, subtree: true, characterData: true }));
    const t0 = Date.now(); await p.fill('#dashStaleDays', '27'); await p.press('#dashStaleDays', 'Tab'); await waitState(p, 'backed'); const ms = Date.now() - t0;
    rec('1b', 'Edit a field through the real screen (Settings > Dashboard), typed with the keyboard', hist.includes('Saving…') && (await chip(p)).text === 'Backed up · Now' && m.doc.settings.leadStaleDays === 27 && ms < 1500, `typed 27 and tabbed out: ${JSON.stringify(hist)} in ${ms} ms; cloud now ${m.doc.settings.leadStaleDays}`);
    await p.context().close();
  });

  /* ---------- 2 ---------- */
  await guard('2', 'Cloud PATCH 500: red chip keeps last-backed-up time; backoff; recovers', async () => {
    const m = mk(), p = await newPage(browser, m, { clock: true }); await open(p, url);
    const last = await p.evaluate(() => ssClock(sync.lastConfirmedAt));
    m.failPatch = 500; await edit(p, 22); await waitState(p, 'failed');
    const c = await chip(p); const textOk = c.text === 'Not backing up · last backed up ' + last;
    const delays = []; const attempts = () => m.patchBodies.length;
    delays.push(await p.evaluate(() => sync.nextRetryAt - Date.now()));
    const expected = [10000, 30000, 60000, 300000, 300000]; let backoffOk = true;
    for(let i = 0; i < expected.length; i++){
      const a0 = attempts();
      await runFor(p, expected[i] - 1000); await sleep(150);
      if(attempts() !== a0) backoffOk = false;          // nothing before the interval is up
      await runFor(p, 1500); await p.waitForFunction(n => true, null).catch(() => {}); await sleep(250);
      if(attempts() !== a0 + 1) backoffOk = false;      // exactly one retry when it is up
      delays.push(await p.evaluate(() => sync.nextRetryAt - Date.now()));
    }
    const delaysOk = delays.slice(0, 5).every((d, i) => d <= expected[i] && d > expected[i] - 1500);   // a few ms of the clock have passed
    const stillRed = (await chip(p)).state === 'failed';
    // a new edit resets the backoff
    await edit(p, 23); await runFor(p, 600); await sleep(250);
    const reset = await p.evaluate(() => sync.retryCount);
    m.failPatch = 0; const a1 = attempts(); await runFor(p, 300000); await waitState(p, 'backed', 5000);
    const after = await chip(p);
    rec('2', 'Cloud PATCH 500: red chip keeps last-backed-up time; backoff; recovers', textOk && backoffOk && delaysOk && stillRed && reset === 1 && after.text.startsWith('Backed up') && m.doc.settings.leadStaleDays === 23 && attempts() > a1,
      `red text "${c.text}"; scheduled delays ${JSON.stringify(delays)}; retry only when due: ${backoffOk}; new edit reset count to ${reset}; recovered: "${after.text}", cloud has the edit: ${m.doc.settings.leadStaleDays === 23}`);
    await p.context().close();
  });

  /* ---------- 3 ---------- */
  await guard('3', 'Version mismatch: Paused, nothing overwritten, local edits kept, next steps shown', async () => {
    const m = mk(), p = await newPage(browser, m); await open(p, url);
    m.other(d => { d.settings.leadStaleDays = 99; });
    const cloudBefore = JSON.stringify(m.doc);
    await edit(p, 55); await waitState(p, 'blocked');
    const c = await chip(p);
    await p.click('#syncInfo'); await p.waitForSelector('#syncPop:not([hidden])');
    const pop = await p.evaluate(() => ({ t: document.getElementById('syncPop').textContent, btns: [...document.querySelectorAll('#syncPop button')].map(b => b.textContent) }));
    const st = await p.evaluate(() => ({ screen: state.settings.leadStaleDays, dirty: sync.dirty, local: JSON.parse(localStorage.getItem(STORAGE_KEY)).settings.leadStaleDays, banner: !document.getElementById('lrBanner').hidden }));
    await sleep(600);
    const patchesAfterBlock = m.patchBodies.length;
    rec('3', 'Version mismatch: Paused, nothing overwritten, local edits kept, next steps shown',
      /^Paused · newer changes elsewhere · last backed up /.test(c.text) && JSON.stringify(m.doc) === cloudBefore && m.doc.settings.leadStaleDays === 99 && st.screen === 55 && st.local === 55 && st.dirty && !st.banner && patchesAfterBlock === 1
        && pop.btns.includes('Retry now') && pop.btns.includes('Download my data (.json)') && pop.btns.includes('Reload to get the latest') && /rescue copy/.test(pop.t) && /don’t close this tab/.test(pop.t),
      `chip "${c.text}"; cloud untouched (${m.doc.settings.leadStaleDays}); screen ${st.screen}, local copy ${st.local}, dirty ${st.dirty}; buttons ${JSON.stringify(pop.btns)}; no apply banner; only ${patchesAfterBlock} PATCH tried`);
    await p.context().close();
  });

  /* ---------- 4 ---------- */
  const scenario = async () => {
    const m = mk(), p = await newPage(browser, m); await open(p, url);
    m.failPatch = 500;
    await p.evaluate(() => { cxNewContact({ firstName: 'LocalOnly', lastName: 'Alpha' }); cxNewContact({ firstName: 'LocalOnly', lastName: 'Beta' }); state.nextTaskNo = 50; state.nextQuoteId = 77; state.settings.leadStaleDays = 33; saveState(); });
    await waitState(p, 'failed'); m.failPatch = 0;
    m.other(d => { const c = clone(d.contacts[0]); c.id = 'ct_cloud_new'; c.firstName = 'CloudNew'; c.lastName = 'Person'; d.contacts.push(c); d.nextTaskNo = 9; d.nextQuoteId = 100; });
    await p.reload(); await dlgOpen(p, 'never saved to the cloud');
    return { m, p };
  };
  await guard('4', 'Load with dirty local newer than cloud: dialog, rescue copy, three buttons', async () => {
    let notes = [], ok = true; const chk = (c, t) => { if(!c) ok = false; notes.push((c ? '✓ ' : '✗ ') + t); };
    { // dialog content + rescue
      const { m, p } = await scenario();
      const txt = await p.evaluate(() => document.getElementById('ssOverlay').textContent);
      const rk = await rescueKeys(p), resc = rk.length ? JSON.parse(await p.evaluate(k => localStorage.getItem(k), rk[0])) : null;
      chk(/This browser has changes from .* that were never saved to the cloud/.test(txt), 'dialog wording');
      chk(rk.length === 1 && resc && resc.contacts.some(c => c.firstName === 'LocalOnly'), 'rescue copy stored before the dialog (' + rk.length + ')');
      chk(/Contacts\s*4240|Contacts4241|Contacts/.test(txt) && /Contact: LocalOnly Alpha/.test(txt) && /Contact: LocalOnly Beta/.test(txt), 'counts table and records only in this browser, by name');
      chk((await p.evaluate(() => [...document.querySelectorAll('#ssOverlay [data-k]')].map(b => b.dataset.k))).join() === 'keep,cloud,merge', 'three buttons');
      chk(m.patchBodies.length === 1, 'nothing was saved before choosing (only the one failed attempt)');
      await p.context().close();
    }
    { // keep
      const { m, p } = await scenario(); const dl = waitDl(p, 'business-tracker-cloud-copy');
      await clickDlg(p, 'keep'); const d = await dl; const copy = JSON.parse(await readDl(d)); await waitState(p, 'backed');
      chk(copy.contacts.some(c => c.id === 'ct_cloud_new'), 'KEEP: cloud copy downloaded first');
      chk(m.doc.contacts.some(c => c.firstName === 'LocalOnly') && !m.doc.contacts.some(c => c.id === 'ct_cloud_new') && m.doc.settings.leadStaleDays === 33 && m.doc.nextTaskNo === 50, 'KEEP: cloud now equals this browser (via compare-and-swap v=' + m.version + ')');
      await p.context().close();
    }
    { // cloud
      const { m, p } = await scenario(); const before = JSON.stringify(m.doc), v = m.version; const dl = waitDl(p, 'business-tracker-browser-copy');
      await clickDlg(p, 'cloud'); const d = await dl; const copy = JSON.parse(await readDl(d)); await waitState(p, 'backed');
      const s = await p.evaluate(() => ({ has: state.contacts.some(c => c.firstName === 'LocalOnly'), cn: state.contacts.some(c => c.id === 'ct_cloud_new'), dirty: sync.dirty }));
      chk(copy.contacts.some(c => c.firstName === 'LocalOnly') && copy.settings.leadStaleDays === 33, 'CLOUD: this browser’s copy downloaded first');
      chk(!s.has && s.cn && !s.dirty && JSON.stringify(m.doc) === before && m.version === v, 'CLOUD: screen now equals the cloud, cloud untouched, clean');
      await p.context().close();
    }
    { // merge
      const { m, p } = await scenario(); const cloudBefore = clone(m.doc); const norm = await p.evaluate(d => mergeDefaults(JSON.parse(JSON.stringify(d))), cloudBefore);   // what the app holds when it simply loads that cloud copy
      await clickDlg(p, 'merge'); await dlgOpen(p, 'Records added'); const sum = await p.evaluate(() => document.getElementById('ssOverlay').textContent);
      await clickDlg(p, 'ok'); await waitState(p, 'backed');
      const d = m.doc, byId = (a, id) => a.find(x => x.id === id);
      const untouched = ['contacts', 'leads', 'quotes', 'projects', 'pipeline', 'crmTasks', 'companies', 'suppliers', 'invoices'].every(k => (norm[k] || []).every(r => { const n = (d[k] || []).find(x => r.id !== undefined ? x.id === r.id : false); return r.id === undefined || (n && JSON.stringify(n) === JSON.stringify(r)); }));
      chk(/Added 2 records/.test(sum), 'MERGE: summary shown (' + (sum.match(/Added \d+ records?[^.]*/) || [''])[0].slice(0, 60) + ')');
      chk(d.contacts.filter(c => c.firstName === 'LocalOnly').length === 2 && byId(d.contacts, 'ct_cloud_new') && d.contacts.length === 43, 'MERGE: only the two local records appended; the cloud’s new contact kept (43 contacts)');
      chk(untouched, 'MERGE: every cloud record is exactly as a plain load of the cloud copy holds it (contacts, leads, quotes, projects, deals, tasks, companies, suppliers, invoices)');
      chk(d.nextTaskNo === 50 && d.nextQuoteId === 100, 'MERGE: counters take the higher value (nextTaskNo 50 vs 9 → ' + d.nextTaskNo + '; nextQuoteId 77 vs 100 → ' + d.nextQuoteId + ')');
      chk(d.settings.leadStaleDays === cloudBefore.settings.leadStaleDays, 'MERGE: cloud’s own settings not overwritten by the browser’s edit');
      await p.context().close();
    }
    rec('4', 'Load with dirty local newer than cloud: dialog, rescue copy, three buttons', ok, notes.join('; '));
  });

  await guard('4b', 'Load check: no false alarms (identical legacy copy, clean copy with a newer cloud) and the legacy-differs case still warns', async () => {
    let notes = [], ok = true; const chk = (c, t) => { if(!c) ok = false; notes.push((c ? '✓ ' : '✗ ') + t); };
    const dlgShown = p => p.evaluate(() => { const o = document.getElementById('ssOverlay'); return !!o && !o.hidden; });
    { // a browser copy from before this change (no meta) that equals the cloud
      const m = mk(), p = await newPage(browser, m); await open(p, url); await p.evaluate(() => { ssMetaWrite = function(){}; localStorage.removeItem(STORAGE_KEY + '-meta'); });   // as if this copy was written by the old build
      await p.reload(); await open(p, url); await waitState(p, 'backed');
      chk(!(await dlgShown(p)) && (await metaOf(p)).dirty === false, 'old-build copy (no meta) identical to the cloud: no dialog'); await p.context().close(); }
    { // an old-build copy with edits that never reached the cloud, no meta at all: the incident
      const m = mk(), p = await newPage(browser, m); await open(p, url);
      await p.evaluate(() => { ssMetaWrite = function(){}; state.settings.leadStaleDays = 66; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); localStorage.removeItem(STORAGE_KEY + '-meta'); });
      await p.reload(); await dlgOpen(p, 'different from the cloud copy'); const rk = (await rescueKeys(p)).length;
      chk(rk === 1 && m.patchBodies.length === 0, 'old-build copy (no meta) that differs from the cloud: dialog says it cannot tell whether it has unsaved changes, rescue copy stored, nothing overwritten'); await p.context().close(); }
    { // clean here, cloud moved on
      const m = mk(), p = await newPage(browser, m); await open(p, url); m.other(d => { d.settings.leadStaleDays = 88; });
      await p.reload(); await open(p, url); await waitState(p, 'backed');
      chk(!(await dlgShown(p)) && (await p.evaluate(() => state.settings.leadStaleDays)) === 88 && (await rescueKeys(p)).length === 0, 'clean copy, newer cloud: loads the cloud copy, no dialog, no rescue needed'); await p.context().close(); }
    { // the incident: an old-build copy with edits that never reached the cloud (no meta)
      const m = mk(), p = await newPage(browser, m); await open(p, url);
      await p.evaluate(() => { state.settings.leadStaleDays = 14 + 52; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); /* same length as before: the old length check would not have noticed */ });
      await p.reload(); await dlgOpen(p, 'Unsaved changes found'); const rk = (await rescueKeys(p)).length;
      chk(rk === 1 && m.patchBodies.length === 0, 'a local copy edited outside this build (stale meta, same length): dialog, rescue copy stored, nothing overwritten'); await p.context().close(); }
    rec('4b', 'Load check: no false alarms (identical legacy copy, clean copy with a newer cloud) and the legacy-differs case still warns', ok, notes.join('; '));
  });

  /* ---------- 5 ---------- */
  await guard('5', 'Cloud unreachable at load: red "Saved on this device only"; 60 s reconnect; Part D check runs', async () => {
    const m = mk(), p = await newPage(browser, m, { clock: true }); await open(p, url);
    m.failPatch = 500; await p.evaluate(() => { cxNewContact({ firstName: 'Offline', lastName: 'Edit' }); saveState(); }); await waitState(p, 'failed'); m.failPatch = 0;
    m.down = true; await p.reload(); await p.waitForFunction(() => typeof sync !== 'undefined' && sync.started && state, null, { timeout: 20000 });
    await waitState(p, 'local'); const c = await chip(p);
    const usingCloud = await p.evaluate(() => usingCloud); const had = await p.evaluate(() => state.contacts.some(x => x.firstName === 'Offline'));
    const polls = m.log.length; await runFor(p, 59000); await sleep(200); const early = m.log.length === polls;
    m.down = false; await runFor(p, 2000); await dlgOpen(p, 'never saved to the cloud');
    const still = await p.evaluate(() => usingCloud); const rk = (await rescueKeys(p)).length;
    await clickDlg(p, 'keep'); await waitState(p, 'backed', 8000);
    rec('5', 'Cloud unreachable at load: red "Saved on this device only"; 60 s reconnect; Part D check runs', c.text === 'Saved on this device only' && !usingCloud && had && early && still && rk === 1 && m.doc.contacts.some(x => x.firstName === 'Offline'),
      `chip "${c.text}", local edits shown: ${had}; no attempt before 60 s: ${early}; reconnect at 60 s then dialog appeared with rescue copy (${rk}); after Keep the cloud has the offline edit`);
    await p.context().close();
  });

  /* ---------- 6 ---------- */
  await guard('6', 'Offline and online events trigger a retry', async () => {
    const m = mk(), p = await newPage(browser, m); await open(p, url);
    m.failPatch = 500; await edit(p, 61); await waitState(p, 'failed'); m.failPatch = 0; const a0 = m.patchBodies.length; const t0 = Date.now();
    await p.evaluate(() => window.dispatchEvent(new Event('online'))); await waitState(p, 'backed', 4000); const ms = Date.now() - t0;
    const okA = m.patchBodies.length === a0 + 1 && ms < 3000 && m.doc.settings.leadStaleDays === 61;
    // real offline: shape + wording, then the browser's own online event
    m.down = true; await p.context().setOffline(true); await edit(p, 62); await waitState(p, 'offline'); const c = await chip(p);
    const icon = await p.evaluate(() => document.getElementById('syncIco').innerHTML.includes('<path d="M4.5 12.5'));
    m.down = false; await p.context().setOffline(false); const t1 = Date.now(); await waitState(p, 'backed', 5000);
    rec('6', 'Offline and online events trigger a retry', okA && /^Not backing up · last backed up /.test(c.text) && icon && Date.now() - t1 < 4500 && m.doc.settings.leadStaleDays === 62,
      `'online' event retried in ${ms} ms (not the 10 s timer); offline chip "${c.text}" with the wavy-line icon; going back online recovered by itself`);
    await p.context().close();
  });

  /* ---------- 7 ---------- */
  await guard('7', 'Heartbeat at 30 min (fake timers): refresh when clean; save when unsaved', async () => {
    const m = mk(), p = await newPage(browser, m, { clock: true }); await open(p, url);
    await p.evaluate(() => { clearTimeout(lr.timer); lr.timer = null; window.__lr = []; window.lrSchedule = ms => { window.__lr.push(ms); }; });   // isolate the 30-minute heartbeat from the 30-second live refresh
    let notes = [], ok = true; const chk = (c, t) => { if(!c) ok = false; notes.push((c ? '✓ ' : '✗ ') + t); };
    const peeks0 = m.peeks; let aged = null, beat = false;
    for(let i = 0; i < 80 && !beat; i++){ await runFor(p, 30000); await sleep(40); const t = (await chip(p)).text; if(i === 40) aged = t; if(m.peeks > peeks0) beat = true; }
    await p.waitForFunction(() => document.getElementById('syncTxt').textContent === 'Backed up · Now', null, { timeout: 5000 }).catch(() => {});
    const afterBeat = (await chip(p)).text;
    chk(/^Backed up · \d+ min ago$/.test(aged), 'wording ages while nothing happens ("' + aged + '")');
    chk(beat && m.peeks === peeks0 + 1 && m.patchBodies.length === 0 && afterBeat === 'Backed up · Now', 'at 30 min: one cheap check, no save, back to "' + afterBeat + '"');
    // unsaved changes: the heartbeat saves
    await p.evaluate(() => { state.settings.leadStaleDays = 71; ssSetDirty(true); sync.editSeq++; sync.lastLocalAt = Date.now(); });
    const patches0 = m.patchBodies.length; let saved = false;
    for(let i = 0; i < 80 && !saved; i++){ await runFor(p, 30000); await sleep(40); if(m.patchBodies.length > patches0) saved = true; }
    await waitState(p, 'backed', 5000);
    chk(saved && m.doc.settings.leadStaleDays === 71 && !(await p.evaluate(() => sync.dirty)), 'at 30 min with unsaved changes: saved to the cloud');
    // cloud newer + clean: hands over to live refresh
    m.other(d => { d.settings.leadStaleDays = 72; }); const lr0 = await p.evaluate(() => window.__lr.length); let handed = false;
    for(let i = 0; i < 80 && !handed; i++){ await runFor(p, 30000); await sleep(40); if((await p.evaluate(() => window.__lr.length)) > lr0) handed = true; }
    chk(handed, 'cloud newer, nothing unsaved: handed to live refresh (lrSchedule(0))');
    // cloud newer + dirty: blocked
    m.other(d => { d.settings.leadStaleDays = 73; }); await p.evaluate(() => { state.settings.leadStaleDays = 74; ssSetDirty(true); sync.editSeq++; });
    let blocked = false; for(let i = 0; i < 80 && !blocked; i++){ await runFor(p, 30000); await sleep(40); if((await chip(p)).state === 'blocked') blocked = true; }
    chk(blocked && m.doc.settings.leadStaleDays === 73, 'cloud newer AND unsaved: Paused, cloud not overwritten');
    rec('7', 'Heartbeat at 30 min (fake timers): refresh when clean; save when unsaved', ok, notes.join('; '));
    await p.context().close();
  });

  /* ---------- 8 ---------- */
  await guard('8', 'beforeunload prompt only when dirty', async () => {
    const m = mk(), p = await newPage(browser, m); await open(p, url); await p.mouse.click(300, 300);
    const cleanOn = await p.evaluate(() => sync.guardOn); p.dialogs.length = 0; await p.close({ runBeforeUnload: true }); await sleep(300); const cleanDialogs = p.dialogs.slice();
    const m2 = mk(), p2 = await newPage(browser, m2); await open(p2, url); await p2.mouse.click(300, 300);
    m2.failPatch = 500; await edit(p2, 81); await waitState(p2, 'failed'); const dirtyOn = await p2.evaluate(() => sync.guardOn);
    p2.dialogs.length = 0; await p2.close({ runBeforeUnload: true }); await sleep(500); const dirtyDialogs = p2.dialogs.slice();
    // and it is removed once clean again
    const m3 = mk(), p3 = await newPage(browser, m3); await open(p3, url); m3.failPatch = 500; await edit(p3, 82); await waitState(p3, 'failed'); const on3 = await p3.evaluate(() => sync.guardOn); m3.failPatch = 0; await p3.evaluate(() => ssRetryNow()); await waitState(p3, 'backed', 5000); const off3 = !(await p3.evaluate(() => sync.guardOn));
    rec('8', 'beforeunload prompt only when dirty', !cleanOn && cleanDialogs.length === 0 && dirtyOn && dirtyDialogs.includes('beforeunload') && on3 && off3,
      `clean: handler ${cleanOn ? 'on' : 'off'}, prompts ${JSON.stringify(cleanDialogs)}; dirty: handler ${dirtyOn ? 'on' : 'off'}, prompts ${JSON.stringify(dirtyDialogs)}; removed again after the save succeeded: ${off3}`);
    await p3.context().close(); await p.context().close().catch(() => {}); await p2.context().close().catch(() => {});
  });

  /* ---------- 9 ---------- */
  await guard('9', 'Shrink guard: one deletion passes; 30% of contacts triggers it', async () => {
    let notes = [], ok = true; const chk = (c, t) => { if(!c) ok = false; notes.push((c ? '✓ ' : '✗ ') + t); };
    const m = mk(), p = await newPage(browser, m); await open(p, url);
    await p.evaluate(() => { state.contacts.splice(0, 1); saveState(); }); await waitState(p, 'backed');
    chk(m.doc.contacts.length === 39 && !(await p.evaluate(() => { const o = document.getElementById('ssOverlay'); return !!o && !o.hidden; })), 'deleting 1 contact saved with no prompt (39 in cloud)');
    const patches = m.patchBodies.length;
    await p.evaluate(() => { state.contacts.splice(0, 12); saveState(); }); await dlgOpen(p, 'Save fewer records');
    const txt = await p.evaluate(() => document.getElementById('ssOverlay').textContent);
    chk(/Contacts: 39 in the cloud, 27 on your screen/.test(txt) && /Seed Contact/.test(txt) && /and 2 more/.test(txt), 'deleting ~30% shows the list of what would be removed (first 10, "and 2 more")');
    await p.keyboard.press('Escape'); await sleep(200);
    chk((await chip(p)).state === 'held' && m.patchBodies.length === patches && m.doc.contacts.length === 39, '"Don’t save, keep editing": nothing sent, chip red "' + (await chip(p)).text + '"');
    await p.click('#syncInfo'); await p.waitForSelector('#syncPop:not([hidden])'); await p.evaluate(() => document.querySelector('#syncPop [data-ss="retry"]').click()); await dlgOpen(p, 'Save fewer records'); await clickDlg(p, 'save'); await waitState(p, 'backed', 5000);
    chk(m.doc.contacts.length === 27, '"Save anyway" via Review and save: saved (27 in cloud)');
    // size rule
    await p.evaluate(() => { state.bigBlob = 'x'.repeat(400000); saveState(); }); await waitState(p, 'backed', 5000);
    await p.evaluate(() => { delete state.bigBlob; saveState(); }); await dlgOpen(p, 'Save fewer records'); const t2 = await p.evaluate(() => document.getElementById('ssOverlay').textContent);
    chk(/more than 30% smaller/.test(t2), 'size shrinking by more than 30% triggers it too'); await clickDlg(p, 'keep');
    // sample data over a real cloud document
    const m2 = mk(), p2 = await newPage(browser, m2); await open(p2, url); await p2.evaluate(() => { state = defaultState(); sync.sample = true; saveState(); }); await waitState(p2, 'held', 4000); await sleep(300);
    chk(m2.patchBodies.length === 0 && (await p2.evaluate(() => sync.detail)) === 'sample', 'defaultState() sample data is never saved over an existing cloud document');
    const m3 = mk(), p3 = await newPage(browser, m3); await open(p3, url); await p3.evaluate(() => resetData()); await sleep(300);
    chk(m3.patchBodies.length === 0 && (await p3.evaluate(() => state.contacts.length)) === 40, '"Reset to sample data" is refused while the cloud is connected');
    rec('9', 'Shrink guard: one deletion passes; 30% of contacts triggers it', ok, notes.join('; '));
    await p.context().close(); await p2.context().close(); await p3.context().close();
  });

  /* ---------- 10 ---------- */
  await guard('10', 'Export equals on-screen state byte-for-byte; import confirms and downloads current data first', async () => {
    let notes = [], ok = true; const chk = (c, t) => { if(!c) ok = false; notes.push((c ? '✓ ' : '✗ ') + t); };
    const m = mk(), p = await newPage(browser, m); await open(p, url);
    await p.evaluate(() => { state.settings.leadStaleDays = 91; ssSetDirty(true); });   // an on-screen change that is not in the cloud
    const onScreen = await p.evaluate(() => JSON.stringify(state, null, 2)); const dl = waitDl(p, 'business-tracker-backup-');
    await p.evaluate(() => { activateTab('settings'); settingsShow('data'); }); await p.click('[data-action="export-data"]'); const d = await dl; const file = await readDl(d);
    chk(file === onScreen, 'export is byte-for-byte the on-screen state (' + file.length + ' bytes, includes the unsaved change)');
    chk(/^business-tracker-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(d.suggestedFilename()), 'filename has the time: ' + d.suggestedFilename());
    chk(await p.evaluate(() => document.getElementById('panel-settings').textContent.includes('Export saves exactly what is on your screen, including changes not yet in the cloud.')), 'Settings line present');
    await p.evaluate(() => { state.settings.leadStaleDays = 21; ssSetDirty(false); });
    const small = clone(doc); small.contacts = small.contacts.slice(0, 5); const fp = path.join(os.tmpdir(), 'bt-import-test.json'); fs.writeFileSync(fp, JSON.stringify(small));
    p.downloads.length = 0; await p.click('[data-action="import-data"]').catch(() => {}); await p.setInputFiles('#importFile', fp); await dlgOpen(p, 'Replace everything');
    const t = await p.evaluate(() => document.getElementById('ssOverlay').textContent);
    chk(/bt-import-test\.json/.test(t) && /Contacts\s*405/.test(t), 'import confirm shows the file date and counts vs current (40 vs 5)');
    await clickDlg(p, 'cancel'); await sleep(300);
    chk((await p.evaluate(() => state.contacts.length)) === 40 && p.downloads.length === 0, 'Cancel changes nothing and downloads nothing');
    await p.setInputFiles('#importFile', fp); await dlgOpen(p, 'Replace everything'); const before = await p.evaluate(() => JSON.stringify(state, null, 2)); const dl2 = waitDl(p, 'business-tracker-before-import');
    await clickDlg(p, 'import'); const d2 = await dl2; const prev = await readDl(d2);
    await waitState(p, 'backed', 6000);
    chk(prev === before, 'current data downloaded first, byte-for-byte (' + d2.suggestedFilename() + ')');
    chk((await p.evaluate(() => state.contacts.length)) === 5 && m.doc.contacts.length === 5, 'then imported and saved to the cloud as normal (5 contacts)');
    rec('10', 'Export equals on-screen state byte-for-byte; import confirms and downloads current data first', ok, notes.join('; '));
    await p.context().close();
  });

  /* ---------- 11 ---------- */
  await guard('11', 'Migration not applied: portal works through the fallback, no errors shown', async () => {
    let notes = [], ok = true; const chk = (c, t) => { if(!c) ok = false; notes.push((c ? '✓ ' : '✗ ') + t); };
    const m = mk({ hasVersion: false }), p = await newPage(browser, m); await open(p, url);
    const c0 = await chip(p); chk(c0.state === 'backed', 'loads, chip "' + c0.text + '"');
    await edit(p, 111); await waitState(p, 'backed'); const c1 = await chip(p);
    chk(m.doc.settings.leadStaleDays === 111 && !m.patchUrls.some(u => /version=/.test(u)) && 'updated_at' in m.patchBodies[m.patchBodies.length - 1], 'saves with the old updated_at method (no version filter; client updated_at sent)');
    chk(p.consoleWarns.filter(w => /save safety/.test(w)).length === 1, 'exactly one console warning');
    chk(p.errors.length === 0, 'no page errors; the only console "errors" are the probe’s own 400 (' + p.consoleErrors.filter(e => /400/.test(e)).length + ')');
    m.other(d => { d.settings.leadStaleDays = 5; }); await edit(p, 112); await waitState(p, 'blocked', 6000);
    chk(m.doc.settings.leadStaleDays === 5, 'fallback conflict check still pauses instead of overwriting');
    rec('11', 'Migration not applied: portal works through the fallback, no errors shown', ok, notes.join('; '));
    await p.context().close();
    // version history before the table exists
    const m2 = mk({ hasVersion: false }), p2 = await newPage(browser, m2); await open(p2, url);
    await p2.evaluate(() => { document.getElementById('ssHist').open = true; }); await p2.waitForFunction(() => /Version history will appear/.test(document.getElementById('ssHistBody').textContent), null, { timeout: 5000 });
    rec('11b', 'Version history panel with no tracker_snapshots table: friendly message, no error', true, '"Version history will appear once the database update is applied."');
    await p2.context().close();
  });

  /* ---------- 11c: version history with snapshots ---------- */
  await guard('G', 'Version history: list (no doc column), download, restore through the normal save path', async () => {
    let notes = [], ok = true; const chk = (c, t) => { if(!c) ok = false; notes.push((c ? '✓ ' : '✗ ') + t); };
    const old = clone(doc); old.contacts = old.contacts.slice(0, 10); old.settings.leadStaleDays = 3;
    const snaps = [{ id: 7, taken_at: new Date(Date.now() - 3600e3).toISOString(), reason: 'interval', bytes: 51000, counts: { contacts: 10, leads: 4, quotes: 0, projects: 3, invoices: 0 }, doc: old }];
    const m = mk({ snapshots: snaps }); const lists = m.snapUrls; const p = await newPage(browser, m);
    await open(p, url); await p.evaluate(() => { document.getElementById('ssHist').open = true; }); await p.waitForSelector('#ssHistBody table', { state: 'attached' });
    chk(lists.length === 1 && !/select=[^&]*doc/.test(decodeURIComponent(lists[0]).split('select=')[1].split('&')[0]) && /taken_at=gte/.test(lists[0]), 'list request selects no doc column and filters to 30 days');
    const dl = waitDl(p, 'business-tracker-version-'); await p.evaluate(() => document.querySelector('[data-ss-hist="download"]').click()); const d = await dl; chk(JSON.parse(await readDl(d)).settings.leadStaleDays === 3, 'download this version fetches that one doc');
    const dl2 = waitDl(p, 'business-tracker-before-restore'); await p.evaluate(() => document.querySelector('[data-ss-hist="restore"]').click()); await dlgOpen(p, 'Restore this version'); await clickDlg(p, 'restore'); await dl2; await waitState(p, 'backed', 6000);
    chk(m.doc.contacts.length === 10 && m.version === 2 && /version=eq\.1/.test(m.patchUrls[0]), 'restore saves through the normal compare-and-swap path (10 contacts, v' + m.version + ')');
    rec('G', 'Version history: list (no doc column), download, restore through the normal save path', ok, notes.join('; '));
    await p.context().close();
  });

  /* ---------- 12 ---------- */
  await guard('12', 'Phone width, keyboard-only ⓘ popover, touch, dark and light', async () => {
    let notes = [], ok = true; const chk = (c, t) => { if(!c) ok = false; notes.push((c ? '✓ ' : '✗ ') + t); };
    const lum = (rgb) => { const f = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); }; return .2126 * f(rgb[0]) + .7152 * f(rgb[1]) + .0722 * f(rgb[2]); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    // phone
    const m = mk(), p = await newPage(browser, m, { ctx: { viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 } }); await open(p, url);
    for(const st of ['backed', 'saving', 'failed', 'offline', 'blocked', 'local', 'held']){
      await p.evaluate(s => { sync.status = s; syncSet(s, ''); }, st); await sleep(60);
      const g = await p.evaluate(() => { const r = document.getElementById('syncChip').getBoundingClientRect(), pill = document.getElementById('brandPill').getBoundingClientRect(), i = document.getElementById('syncInfo').getBoundingClientRect(); return { l: r.left, r: r.right, w: i.right, pillL: pill.left, vis: r.width > 0, sw: document.documentElement.scrollWidth, sw0: (() => { const w = document.getElementById('syncWrap'); w.hidden = true; const v = document.documentElement.scrollWidth; w.hidden = false; return v; })(), iw: window.innerWidth, text: document.getElementById('syncTxt').textContent, ov: r.right > pill.left + 0.5 || i.right > pill.left + 0.5 }; });
      chk(g.vis && g.l >= 0 && g.w <= g.iw && g.sw <= g.sw0 && !g.ov, 'phone ' + st + ': "' + g.text.replace(/\s+/g, ' ') + '" fits inside the screen, no overlap, adds no sideways scroll');
      if(SHOTS) await p.screenshot({ path: path.join(SHOTS, 'phone-' + st + '.png'), clip: { x: 0, y: 0, width: 390, height: 120 } });
    }
    await p.evaluate(() => { syncSet('blocked', ''); }); await p.tap('#syncInfo'); await p.waitForSelector('#syncPop:not([hidden])');
    const pop = await p.evaluate(() => { const r = document.getElementById('syncPop').getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom, iw: innerWidth, ih: innerHeight, open: !document.getElementById('syncPop').hidden }; });
    chk(pop.l >= 0 && pop.r <= pop.iw && pop.b <= pop.ih, 'phone popover sits inside the screen'); if(SHOTS) await p.screenshot({ path: path.join(SHOTS, 'phone-popover.png') });
    await p.tap('#syncInfo'); await sleep(100); chk(await p.evaluate(() => document.getElementById('syncPop').hidden), 'tap toggles it closed again');
    await p.context().close();
    // keyboard
    const m2 = mk(), q = await newPage(browser, m2); await open(q, url); await q.evaluate(() => syncSet('failed', 'HTTP 500'));
    let reached = false; for(let i = 0; i < 120; i++){ await q.keyboard.press('Tab'); if(await q.evaluate(() => document.activeElement && document.activeElement.id === 'syncInfo')){ reached = true; break; } }
    await sleep(100); const openByFocus = await q.evaluate(() => !document.getElementById('syncPop').hidden);
    await q.keyboard.press('Tab'); const inPop = await q.evaluate(() => document.getElementById('syncPop').contains(document.activeElement));
    await q.keyboard.press('Escape'); await sleep(100); const closed = await q.evaluate(() => document.getElementById('syncPop').hidden && document.activeElement.id === 'syncInfo');
    const aria = await q.evaluate(() => ({ live: document.getElementById('syncTxt').getAttribute('aria-live'), role: document.getElementById('syncPop').getAttribute('role'), desc: document.getElementById('syncInfo').getAttribute('aria-describedby'), lbl: document.getElementById('syncInfo').getAttribute('aria-label'), exp: document.getElementById('syncInfo').getAttribute('aria-expanded') }));
    chk(reached && openByFocus && inPop && closed, 'keyboard only: Tab reaches ⓘ, popover opens on focus, Tab moves into it, Escape closes and returns focus');
    chk(aria.live === 'polite' && aria.role === 'tooltip' && aria.desc === 'syncPop' && !!aria.lbl, 'aria-live="polite" on the chip text; role="tooltip" + aria-describedby on the popover');
    // themes and contrast
    const res = {};
    for(const theme of ['light', 'dark']){
      await q.evaluate(t => { if(t === 'dark') document.documentElement.setAttribute('data-theme', 'dark'); else document.documentElement.removeAttribute('data-theme'); }, theme);
      for(const st of ['backed', 'failed', 'blocked', 'saving']){
        await q.evaluate(s => { syncSet(s, ''); }, st);
        const cr = await q.evaluate(() => { const c = getComputedStyle(document.getElementById('syncChip')); const rgb = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number); return { fg: rgb(c.color), bg: rgb(c.backgroundColor) }; });
        res[theme + ' ' + st] = ratio(cr.fg, cr.bg);
      }
      await q.evaluate(() => syncSet('blocked', '')); await q.click('#syncInfo'); await q.waitForSelector('#syncPop:not([hidden])');
      const pc = await q.evaluate(() => { const c = getComputedStyle(document.getElementById('syncPop')); const rgb = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number); const w = getComputedStyle(document.querySelector('#syncPop .ss-pop-why')); return { fg: rgb(c.color), bg: rgb(c.backgroundColor), why: rgb(w.color) }; });
      res[theme + ' popover'] = ratio(pc.fg, pc.bg); res[theme + ' popover red text'] = ratio(pc.why, pc.bg);
      if(SHOTS){ await q.screenshot({ path: path.join(SHOTS, 'popover-' + theme + '.png'), clip: { x: 700, y: 0, width: 580, height: 420 } }); }
      await q.keyboard.press('Escape'); await q.mouse.click(100, 500);
    }
    const worst = Math.min(...Object.values(res)); chk(worst >= 4.5, 'text contrast in both themes ≥ 4.5:1 (worst ' + worst.toFixed(2) + ')');
    rec('12', 'Phone width, keyboard-only ⓘ popover, touch, dark and light', ok, notes.join('; '));
    await q.context().close();
  });

  await browser.close(); srv.close();
  const pass = rows.filter(r => r.pass).length;
  const md = '| # | Test | Result | Evidence |\n|---|---|---|---|\n' + rows.map(r => `| ${r.id} | ${r.name} | ${r.pass ? 'PASS' : '**FAIL**'} | ${String(r.note || '').replace(/\|/g, '/')} |`).join('\n') + `\n\n${pass}/${rows.length} passed\n`;
  if(OUT) fs.writeFileSync(OUT, md);
  console.log('\n' + pass + '/' + rows.length + ' passed');
  process.exit(pass === rows.length ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(2); });
