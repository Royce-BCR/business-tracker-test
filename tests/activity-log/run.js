/* Activity Log tests (Stage 2, Part D). Every Supabase call is mocked (../save-safety/harness.js). Nothing touches a real database.
   Run:  NODE_PATH=<global node_modules> HTML=index.html DOCID=2 PREFIX=bt-test- node run.js [results.md]
   Test 9 is "all Save Safety tests still pass": run ../save-safety/run.js on the same build (see docs/activity-log.md). */
const fs = require('fs'), path = require('path');
const H = require('../save-safety/harness');
const { Mock, newPage, chip, waitState, open, serve, chromium } = H;
const OUT = process.argv[2] || null, SHOTS = process.env.SHOTS || null;
const rows = [];
const rec = (id, name, pass, note) => { rows.push({ id, name, pass, note }); console.log((pass ? 'PASS ' : 'FAIL ') + id + ' ' + name + (note ? ' — ' + note : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clone = o => JSON.parse(JSON.stringify(o));
const uuid = i => '00000000-0000-4000-8000-' + String(i).padStart(12, '0');
const flushed = (m, n, ms) => { const t0 = Date.now(); return (async () => { while(Date.now() - t0 < (ms || 8000)){ if(m.activity.length >= n) return true; await sleep(100); } return false; })(); };
const gotoActivity = async p => { await p.evaluate(() => { activateTab('settings'); settingsShow('activity', true); }); };
const rowsOnScreen = p => p.evaluate(() => [...document.querySelectorAll('#alList .al-row')].map(r => ({ id: r.dataset.id || '', time: r.querySelector('.al-time').textContent, who: r.querySelector('.al-who').textContent, area: r.querySelector('.al-area').textContent, text: r.querySelector('.al-sum').textContent })));
const waitRows = (p, n) => p.waitForFunction(k => document.querySelectorAll('#alList .al-row').length === k, n, { timeout: 8000 });

async function main(){
  const doc = await H.baseDoc(8);
  const browser = await chromium.launch(); const { srv, url } = await serve();
  const mk = o => new Mock(clone(doc), o);
  const guard = async (id, name, fn) => { try{ await fn(); }catch(e){ rec(id, name, false, 'ERROR: ' + String(e.message || e).split('\n')[0]); } };
  const startOfToday = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime(); };
  const seed = (m, list) => list.forEach((r, i) => m.activity.push(Object.assign({ id: uuid(m.activity.length + 1), doc_id: H.DOCID, by: 'Lynton', area: 'contacts', record_id: null, record_label: null, action: 'edited', summary: 'row ' + i, changes: null, session: 'abc' }, r)));

  /* ---------- 1 ---------- */
  await guard('1', 'Field edit, added contact, deleted lead and project stage move each give the right row and summary', async () => {
    let notes = [], ok = true; const chk = (c, t) => { if(!c) ok = false; notes.push((c ? '✓ ' : '✗ ') + t); };
    const m = mk(), p = await newPage(browser, m); await open(p, url);
    const team = await p.evaluate(() => apTeam()); const whoA = team[0] || '';
    const leadName = await p.evaluate(() => boardTitle('lead', state.leads[0])), pStage0 = await p.evaluate(() => projStage6(state.projects[0]).name);
    await p.evaluate(() => { state.quotes[0].project = 'Step Replacement v2'; saveState(); }); await waitState(p, 'backed'); await flushed(m, 1);
    await p.evaluate(() => { cxNewContact({ firstName: 'John', lastName: 'Davies' }); saveState(); }); await waitState(p, 'backed'); await flushed(m, 2);
    await p.evaluate(() => { state.leads.splice(0, 1); saveState(); }); await waitState(p, 'backed'); await flushed(m, 3);
    await p.evaluate(() => { projSetStageByHand(state.projects[0], 'onsite'); saveState(); }); await waitState(p, 'backed'); await flushed(m, 4);
    const a = m.activity.filter(x => x.action !== 'system'); const by = (ar, ac) => a.find(x => x.area === ar && x.action === ac);
    chk(by('quotes', 'edited') && /^Edited quote \S+: project Step Replacement → Step Replacement v2$/.test(by('quotes', 'edited').summary), 'field edit: "' + (by('quotes', 'edited') || {}).summary + '"');
    chk(by('contacts', 'added') && by('contacts', 'added').summary === 'Added contact: John Davies', 'added contact: "' + (by('contacts', 'added') || {}).summary + '"');
    chk(by('leads', 'deleted') && by('leads', 'deleted').summary === 'Deleted lead: ' + leadName, 'deleted lead: "' + (by('leads', 'deleted') || {}).summary + '"');
    chk(by('projects', 'moved') && by('projects', 'moved').summary === 'Changed stage: ' + pStage0 + ' → On site', 'project stage move: "' + (by('projects', 'moved') || {}).summary + '"');
    chk(a.length === 4, 'exactly one row per change (' + a.length + ' rows)');
    chk(a.every(x => x.by === 'Unknown'), 'no person picked: shown as "Unknown"');
    chk(new Set(m.activity.map(x => x.session)).size === 1 && /^[0-9a-f]{8}$/.test(m.activity[0].session) && m.activity.every(x => /^[0-9a-f-]{36}$/.test(x.id)), 'one per-browser session id; row ids are browser-made uuids');
    if(whoA){ await p.evaluate(n => { localStorage.setItem(AP_WHO_KEY, n); state.quotes[0].project = 'Step Replacement v3'; saveState(); }, whoA); await waitState(p, 'backed'); await flushed(m, 5); chk(m.activity[m.activity.length - 1].by === whoA, 'the "who" picker value is used (' + whoA + ')'); }
    chk(m.activity.every(x => String(x.doc_id) === String(H.DOCID)), 'every row carries doc_id ' + H.DOCID);
    rec('1', 'Field edit, added contact, deleted lead and project stage move each give the right row and summary', ok, notes.join('; '));
    await p.context().close();
  });

  /* ---------- 2 ---------- */
  await guard('2', 'Noise fields and base64 files never appear in the log', async () => {
    let notes = [], ok = true; const chk = (c, t) => { if(!c) ok = false; notes.push((c ? '✓ ' : '✗ ') + t); };
    const m = mk(), p = await newPage(browser, m); await open(p, url);
    await p.evaluate(() => {
      state.undoLog.push({ id: 'u1', at: Date.now(), label: 'x' }); state.tableModes.demo = 1; state.colWidths.demo = 3; state.nextQuoteId += 7; state.nextRecordId += 3; state.nextTaskNo += 2; state.poNextNo += 1;
      state.cx.report = { a: 1 }; state.crmPrefs.hiddenCols = ['zz']; state.actionPrefs.shownCols = ['zz'];
      state.contacts[0].timeline.push({ id: 'tl1', kind: 'note', date: '2026-11-23', text: 'timeline entry' });
      state.projects[0].msPlanLog = [{ id: 'pl1', kind: 'planned', key: 'x', from: '', to: '2026-12-01', at: new Date().toISOString(), by: 'x' }];
      state.leads[0].touchedAt = '2026-11-23T10:00:00Z'; state.leads[0].updatedAt = '2026-11-23T10:00:00Z'; state.leads[1].stageAuto = true;
      saveState(); });
    await waitState(p, 'backed'); await sleep(2500);
    chk(m.activity.length === 0, 'timeline, msPlanLog, undoLog, tableModes, col widths, prefs, counters, cx report, touch/updated stamps: no rows (' + m.activity.length + ')');
    const b64 = 'data:image/png;base64,' + 'QUJD'.repeat(2000);
    await p.evaluate(b => { state.contacts[1].photo = b; state.branding.logos = { main: b }; state.suppliers[0].image = b; state.suppliers[0].notes = [{ id: 'n1', text: 'N'.repeat(400) + ' some long note text here', date: '2026-11-23' }]; state.leads[2].notes = 'L'.repeat(300) + ' long lead note'; saveState(); }, b64);
    await waitState(p, 'backed'); await flushed(m, 3); await sleep(500);
    const all = JSON.stringify(m.activity);
    chk(!/base64|data:image|QUJDQUJD/.test(all), 'a base64 file never appears (photo, logo, supplier image)');
    chk(m.activity.every(x => JSON.stringify(x).length < 2000) && m.activity.every(x => !(x.changes || []).some(c => String(c.from).length > 201 || String(c.to).length > 201)), 'every value is truncated to 200 characters; no row is large');
    const sup = m.activity.find(x => x.area === 'suppliers'), ld = m.activity.find(x => x.area === 'leads'); chk(sup && /notes edited/.test(sup.summary) && ld && /notes edited/.test(ld.summary) && !/NNNN|LLLL/.test(JSON.stringify(m.activity)), 'long notes (a list of note entries, and a text field) are "notes edited", never their text ("' + (sup || {}).summary + '" / "' + (ld || {}).summary + '")');
    const brand = m.activity.find(x => x.area === 'settings' && /Branding/.test(x.summary)); chk(brand && brand.summary === 'Changed setting: Branding', 'branding change is logged without values');
    rec('2', 'Noise fields and base64 files never appear in the log', ok, notes.join('; '));
    await p.context().close();
  });

  /* ---------- 3 ---------- */
  await guard('3', 'Failed cloud save sends no log rows; they flush after recovery; retry never duplicates', async () => {
    let notes = [], ok = true; const chk = (c, t) => { if(!c) ok = false; notes.push((c ? '✓ ' : '✗ ') + t); };
    const m = mk(), p = await newPage(browser, m, { clock: true }); await open(p, url);
    m.failPatch = 500; await p.evaluate(() => { state.quotes[0].project = 'During outage'; saveState(); }); await waitState(p, 'failed');
    await p.clock.runFor(4000); await sleep(300);
    chk(m.activityPosts.length === 0 && m.activity.length === 0, 'while the cloud save is failing nothing is sent to the log (0 posts)');
    chk(await p.evaluate(() => alQueueRead().length === 0 || alQueueRead().every(e => e.action === 'system')), 'no edit rows are queued before the save is confirmed (only system events wait)');
    m.failPatch = 0; await p.evaluate(() => ssRetryNow()); await waitState(p, 'backed', 6000); await p.clock.runFor(2000);
    await flushed(m, 3); const a = m.activity;
    chk(a.some(x => x.area === 'quotes' && /During outage/.test(x.summary)), 'after recovery the edit row arrives');
    chk(a.some(x => /^Cloud save failed/.test(x.summary)) && a.some(x => /^Cloud save recovered/.test(x.summary)), 'system rows: cloud save failed, and recovered');
    // a lost acknowledgement: the rows were stored but the browser saw an error, so it retries the SAME ids
    m.loseAck = 1; const before = m.activity.length; await p.evaluate(() => { state.quotes[0].project = 'Second edit'; saveState(); }); await waitState(p, 'backed', 6000); await p.clock.runFor(2000); await sleep(400);
    const stuck = await p.evaluate(() => alQueueRead().length);
    await p.clock.runFor(11000); await sleep(600); await p.clock.runFor(11000); await sleep(600);
    const ids = m.activity.map(x => x.id), flat = [].concat(...m.activityPosts);
    chk(m.activity.length === before + 1 && new Set(ids).size === ids.length, 'a retried batch creates no duplicate rows (' + ids.length + ' rows, all ids unique)');
    chk(stuck >= 1 && flat.filter(i => i === m.activity[m.activity.length - 1].id).length >= 2 && (await p.evaluate(() => alQueueRead().length)) === 0, 'the same ids were sent twice, then the queue emptied');
    rec('3', 'Failed cloud save sends no log rows; they flush after recovery; retry never duplicates', ok, notes.join('; '));
    await p.context().close();
  });

  /* ---------- 4 ---------- */
  await guard('4', 'Missing activity_log table does not break saving; queue capped at 500; works once the table exists', async () => {
    let notes = [], ok = true; const chk = (c, t) => { if(!c) ok = false; notes.push((c ? '✓ ' : '✗ ') + t); };
    const m = mk({ activity: false }), p = await newPage(browser, m, { clock: true }); await open(p, url);
    for(let i = 0; i < 3; i++){ await p.evaluate(v => { state.settings.leadStaleDays = v; state.quotes[0].project = 'edit ' + v; saveState(); }, 30 + i); await waitState(p, 'backed', 6000); }
    await p.clock.runFor(2000); await sleep(300);
    chk((await chip(p)).state === 'backed' && m.doc.settings.leadStaleDays === 32 && m.doc.quotes[0].project === 'edit 32', 'saving the main data works (chip "' + (await chip(p)).text + '", cloud has the last edit)');
    chk(p.errors.length === 0 && !(await p.evaluate(() => document.getElementById('ssOverlay') && !document.getElementById('ssOverlay').hidden)), 'no page errors, no dialog');
    await p.evaluate(() => { const ev = []; for(let i = 0; i < 700; i++) ev.push(alMk('contacts', 'added', 'x' + i, 'Name ' + i, 'Added contact: Name ' + i, null)); alEnqueue(ev); }); await p.evaluate(() => alFlush()); await sleep(500);
    chk((await p.evaluate(() => alQueueRead().length)) <= 500 && (await p.evaluate(() => alQueueRead().length)) > 400, 'the queue is capped at 500 events (' + await p.evaluate(() => alQueueRead().length) + ')');
    await p.evaluate(() => { activateTab('settings'); settingsShow('activity', true); }); await p.waitForFunction(() => /database update is applied/.test(document.getElementById('alList').textContent), null, { timeout: 6000 });
    chk(true, 'Activity screen says "Activity will appear once the database update is applied."');
    m.hasActivity = true; await p.clock.runFor(10 * 60 * 1000 + 2000); await flushed(m, 400, 8000);
    chk(m.activity.length >= 400, 'once the table exists the waiting events flush by themselves (' + m.activity.length + ' rows)');
    rec('4', 'Missing activity_log table does not break saving; queue capped at 500; works once the table exists', ok, notes.join('; '));
    await p.context().close();
  });

  /* ---------- 5 ---------- */
  await guard('5', 'Load more: 45 rows over 3 days page in 20s, newest first, no gaps or repeats', async () => {
    let notes = [], ok = true; const chk = (c, t) => { if(!c) ok = false; notes.push((c ? '✓ ' : '✗ ') + t); };
    const m = mk(), p = await newPage(browser, m); const d0 = startOfToday();
    const list = []; for(let i = 0; i < 20; i++) list.push({ at: new Date(d0 + (i + 1) * 1000).toISOString(), summary: 'today ' + i });
    for(let i = 0; i < 15; i++) list.push({ at: new Date(d0 - 86400000 + 12 * 3600000 + i * 60000).toISOString(), summary: 'yesterday ' + i });
    const tie = new Date(d0 - 2 * 86400000 + 9 * 3600000).toISOString();
    for(let i = 0; i < 10; i++) list.push({ at: i < 4 ? tie : new Date(d0 - 2 * 86400000 + 9 * 3600000 - i * 60000).toISOString(), summary: 'older ' + i });   // 4 rows share one timestamp
    seed(m, list); await open(p, url); await gotoActivity(p); await waitRows(p, 20);
    const expected = m.activity.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (a.id < b.id ? 1 : -1)).map(x => x.summary);
    const g1 = await rowsOnScreen(p); const more1 = await p.isVisible('#alMore');
    await p.click('#alMore'); await waitRows(p, 40); const g2 = await rowsOnScreen(p);
    await p.click('#alMore'); await waitRows(p, 45); const g3 = await rowsOnScreen(p); const moreEnd = await p.isVisible('#alMore');
    const texts = g3.map(r => r.text.replace(/\s+/g, ' ').trim());
    chk(g1.length === 20 && more1 && g2.length === 40 && g3.length === 45 && !moreEnd, 'pages of 20, 40, then all 45; Load more disappears at the end');
    chk(JSON.stringify(texts) === JSON.stringify(expected), 'order is newest first with no gaps or repeats, including the 4 rows with the same timestamp at the page boundary');
    const heads = await p.evaluate(() => [...document.querySelectorAll('#alList .al-day')].map(h => h.textContent));
    chk(heads[0] === 'Today' && heads[1] === 'Yesterday' && heads.length === 3 && /\d/.test(heads[2]), 'sticky day headers: ' + heads.join(' / '));
    chk(m.activityGets.length === 3 && m.activityGets.every(u => /limit=20/.test(u)) && !/offset=/.test(m.activityGets.join()) && /and=/.test(m.activityGets[1]), 'three requests of 20, paged by a cursor on time (no offset); the first opens with only 20 rows');
    const sticky = await p.evaluate(() => getComputedStyle(document.querySelector('.al-day')).position); chk(sticky === 'sticky', 'day header is sticky');
    rec('5', 'Load more: 45 rows over 3 days page in 20s, newest first, no gaps or repeats', ok, notes.join('; '));
    await p.context().close();
  });

  /* ---------- 6 ---------- */
  await guard('6', 'Filters, search, Today only, hide system and the record link', async () => {
    let notes = [], ok = true; const chk = (c, t) => { if(!c) ok = false; notes.push((c ? '✓ ' : '✗ ') + t); };
    const m = mk(), p = await newPage(browser, m); await open(p, url); const d0 = startOfToday();
    const cid = await p.evaluate(() => state.contacts[0].id), cname = await p.evaluate(() => ctName(state.contacts[0])), pid = await p.evaluate(() => state.projects[0].id), pname = await p.evaluate(() => boardTitle('project', state.projects[0]));
    seed(m, [
      { at: new Date(d0 + 5000).toISOString(), by: 'Lynton', area: 'contacts', action: 'edited', record_id: cid, record_label: cname, summary: 'Edited contact ' + cname + ': phone 1 → 2', changes: [{ field: 'phone', from: '1', to: '2' }] },
      { at: new Date(d0 + 4000).toISOString(), by: 'Royce', area: 'projects', action: 'moved', record_id: String(pid), record_label: pname, summary: 'Changed stage: Planning → On site', changes: [{ field: 'stage', from: 'Planning', to: 'On site' }] },
      { at: new Date(d0 + 3000).toISOString(), by: 'Royce', area: 'quotes', action: 'edited', record_id: '9999', record_label: 'GONE1', summary: 'Edited quote GONE1: price 1 → 2' },
      { at: new Date(d0 + 2000).toISOString(), by: 'Unknown', area: 'system', action: 'system', summary: 'Exported a backup (.json)' },
      { at: new Date(d0 - 86400000 + 3600000).toISOString(), by: 'Lynton', area: 'leads', action: 'added', summary: 'Added lead: Old lead yesterday' }]);
    await gotoActivity(p); await waitRows(p, 5);
    const cnt = () => p.evaluate(() => document.querySelectorAll('#alList .al-row').length);
    await p.selectOption('#alBy', 'Royce'); await p.waitForFunction(() => document.querySelectorAll('#alList .al-row').length === 2); chk(true, 'person filter (Royce): 2 rows');
    await p.selectOption('#alBy', ''); await p.selectOption('#alArea', 'leads'); await p.waitForFunction(() => document.querySelectorAll('#alList .al-row').length === 1); chk(true, 'area filter (Leads): 1 row'); await p.selectOption('#alArea', ''); await waitRows(p, 5);
    await p.fill('#alQ', 'GONE1'); await p.waitForFunction(() => document.querySelectorAll('#alList .al-row').length === 1, null, { timeout: 5000 }); chk(m.activityGets.some(u => /ilike/.test(decodeURIComponent(u)) && /GONE1/.test(decodeURIComponent(u))), 'text search is done by the database (ilike), 1 row'); await p.fill('#alQ', ''); await waitRows(p, 5);
    await p.check('#alToday'); await waitRows(p, 4); chk(true, 'Today only: 4 rows (the yesterday row is gone)'); await p.uncheck('#alToday'); await waitRows(p, 5);
    await p.check('#alHideSys'); await waitRows(p, 4); chk(!(await rowsOnScreen(p)).some(r => /Exported/.test(r.text)), 'hide system events removes the system row'); await p.uncheck('#alHideSys'); await waitRows(p, 5);
    const links = await p.evaluate(() => [...document.querySelectorAll('#alList .al-link')].map(l => l.textContent)); chk(links.includes(cname) && links.includes(pname) && !links.includes('GONE1'), 'record names are links only where the record still exists (deleted "GONE1" is plain text)');
    await p.evaluate(c => { document.querySelector('#alList .al-link[data-al-open="contacts"]').click(); }, cid); await sleep(400);
    chk((await p.evaluate(() => cxUi.cid)) === cid && (await p.evaluate(() => document.querySelector('.panel.active').id)) === 'panel-contacts', 'the contact link opens that contact');
    await p.evaluate(() => { activateTab('settings'); settingsShow('activity', true); }); await waitRows(p, 5);
    await p.evaluate(() => document.querySelector('#alList .al-link[data-al-open="projects"]').click()); await sleep(400);
    chk((await p.evaluate(() => pwUi.id)) === pid, 'the project link opens that project');
    await p.evaluate(() => { activateTab('settings'); settingsShow('activity', true); }); await waitRows(p, 5);
    await p.click('.al-exp >> nth=0'); const open1 = await p.evaluate(() => { const d = document.querySelector('.al-detail:not([hidden])'); return d ? d.textContent : ''; }); chk(/phone/.test(open1) && /1/.test(open1) && /2/.test(open1), 'expanding a row shows the before and after');
    rec('6', 'Filters, search, Today only, hide system and the record link', ok, notes.join('; '));
    await p.context().close();
  });

  /* ---------- 7 ---------- */
  await guard('7', 'A bulk change gives one readable summary row, not hundreds', async () => {
    let notes = [], ok = true; const chk = (c, t) => { if(!c) ok = false; notes.push((c ? '✓ ' : '✗ ') + t); };
    const m = mk(), p = await newPage(browser, m); await open(p, url);
    const added = await p.evaluate(() => { const n0 = state.contacts.length, l0 = JSON.stringify(state.leads).length; state.cx.migratedAt = ''; cxMigrate(); saveState(); return { contacts: state.contacts.length - n0, companies: state.companies.length }; });
    await waitState(p, 'backed'); await flushed(m, 2); await sleep(500);
    const a = m.activity; const sums = a.map(x => x.area + ': ' + x.summary);
    chk(added.contacts >= 3, 'the Build contacts run created ' + added.contacts + ' contacts and ' + added.companies + ' companies');
    chk(a.length <= 8 && a.filter(x => x.area === 'contacts' && x.action === 'added').length === 1, 'only ' + a.length + ' rows in total, and ONE row for the added contacts');
    const row = a.find(x => x.area === 'contacts' && x.action === 'added'); chk(row && /^Added \d+ contacts: .* and \d+ more$/.test(row.summary), 'readable summary: "' + (row || {}).summary + '"');
    chk(a.some(x => /Build contacts/.test(x.summary) && x.action === 'system'), 'and a system row says Build contacts was run');
    await p.evaluate(() => { const base = state.contacts[0]; for(let i = 0; i < 300; i++){ const c = JSON.parse(JSON.stringify(base)); c.id = 'bulk_' + i; c.firstName = 'Bulk'; c.lastName = 'Person ' + i; state.contacts.push(c); } saveState(); });
    await waitState(p, 'backed'); await flushed(m, a.length + 1); await sleep(400);
    const b = m.activity.filter(x => /Bulk Person|Added 300 contacts/.test(x.summary + (x.record_label || ''))); const big = m.activity.find(x => /^Added 300 contacts/.test(x.summary));
    chk(big && m.activity.length < a.length + 3 && big.changes.length <= 11, 'adding 300 contacts at once is one row: "' + (big || {}).summary + '" (' + m.activity.length + ' rows in total)');
    rec('7', 'A bulk change gives one readable summary row, not hundreds', ok, notes.join('; '));
    await p.context().close();
  });

  /* ---------- 8 ---------- */
  await guard('8', 'Performance: diff engine on a 780 KB document adds no visible delay', async () => {
    let notes = [], ok = true; const chk = (c, t) => { if(!c) ok = false; notes.push((c ? '✓ ' : '✗ ') + t); };
    const m = mk(), p = await newPage(browser, m); await open(p, url);
    const size = await p.evaluate(() => { const base = state.contacts[0]; let i = 0; while(JSON.stringify(state).length < 780000){ const c = JSON.parse(JSON.stringify(base)); c.id = 'perf_' + (i++); c.firstName = 'Perf'; c.lastName = 'Contact ' + i; c.notes = 'some notes about this contact '.repeat(8); state.contacts.push(c); if(i % 3 === 0){ state.transactions.push({ date: '2026-11-0' + (1 + i % 9), description: 'Txn ' + i, category: 'Materials', moneyIn: 0, moneyOut: i, linkedCode: '' }); } } sync.alPrev = alSnapshot(state); sync.confirmed = ssSummary(state, JSON.stringify(state).length); return JSON.stringify(state).length; });
    // 1. the engine alone, one record changed
    const eng = await p.evaluate(() => { const t = []; for(let k = 0; k < 15; k++){ state.contacts[3 + k].lastName = 'Edited ' + k; const t0 = performance.now(); const r = alPrepare(state); t.push(performance.now() - t0); sync.alPrev = r.snap; } t.sort((a, b) => a - b); return { median: t[7], max: t[14] }; });
    // 2. end to end save with the engine, and with the engine switched off (same machine, same doc)
    const e2e = async (off, tag) => { const t = []; for(let k = 0; k < 6; k++){ const r = await p.evaluate(async (a) => { const ap = alPrepare; if(a.off) window.alPrepare = () => null; state.contacts[40 + a.k].lastName = 'E2E ' + a.k + Math.random(); const t0 = performance.now(); saveState(); await new Promise(res => { const i = setInterval(() => { if(!sync.dirty && !sync.running){ clearInterval(i); res(); } }, 2); }); const dt = performance.now() - t0; window.alPrepare = ap; return dt; }, { off, k }); t.push(r); } t.sort((a, b) => a - b); return t[3]; };
    const withEng = await e2e(false), without = await e2e(true);
    chk(size >= 780000, 'test document is ' + Math.round(size / 1024) + ' KB (' + size + ' characters)');
    chk(eng.median < 25 && eng.max < 60, 'diff engine alone (snapshot + compare, one record changed): median ' + eng.median.toFixed(1) + ' ms, worst ' + eng.max.toFixed(1) + ' ms');
    chk(withEng - without < 40, 'whole save (500 ms debounce + serialise + local write + mocked cloud) ' + withEng.toFixed(0) + ' ms with the log engine versus ' + without.toFixed(0) + ' ms without it: +' + (withEng - without).toFixed(0) + ' ms');
    rec('8', 'Performance: diff engine on a 780 KB document adds no visible delay', ok, notes.join('; '));
    await p.context().close();
  });

  /* ---------- 10: the screen states, phone, dark, keyboard ---------- */
  await guard('10', 'Activity screen: loading, empty, error and retry; phone width; dark and light; keyboard and labels', async () => {
    let notes = [], ok = true; const chk = (c, t) => { if(!c) ok = false; notes.push((c ? '✓ ' : '✗ ') + t); };
    const d0 = startOfToday();
    const m = mk(), p = await newPage(browser, m); await open(p, url); await gotoActivity(p);
    await p.waitForFunction(() => /No activity recorded yet/.test(document.getElementById('alList').textContent), null, { timeout: 5000 }); chk(true, 'empty state: "No activity recorded yet…"');
    seed(m, [{ at: new Date(d0 + 5000).toISOString(), summary: 'Edited contact Zed: phone 1 → 2', record_label: 'Zed', changes: [{ field: 'phone', from: '1', to: '2' }] }]);
    m.down = true; await p.evaluate(() => alLoad(false)); await p.waitForFunction(() => /Couldn.t load activity/.test(document.getElementById('alList').textContent), null, { timeout: 8000 }); chk(true, 'error state: "Couldn’t load activity" with a Retry button');
    m.down = false; await p.click('[data-al="retry"]'); await waitRows(p, 1); chk(true, 'Retry loads the rows');
    const a11y = await p.evaluate(() => ({ status: document.getElementById('alStatus').getAttribute('role'), exp: document.querySelector('.al-exp').getAttribute('aria-label'), expanded: document.querySelector('.al-exp').getAttribute('aria-expanded'), lbls: [...document.querySelectorAll('.al-filters label')].every(l => l.textContent.trim().length > 0), time: !!document.querySelector('.al-time time[datetime]') }));
    chk(a11y.status === 'status' && /Show the before and after/.test(a11y.exp) && a11y.expanded === 'false' && a11y.lbls && a11y.time, 'labelled filters, a live status region, labelled expand buttons with aria-expanded, real <time> elements');
    await p.focus('#alBy'); let reached = false; for(let i = 0; i < 12; i++){ await p.keyboard.press('Tab'); if(await p.evaluate(() => document.activeElement.classList.contains('al-exp'))){ reached = true; break; } } await p.keyboard.press('Enter'); await sleep(100);
    chk(reached && (await p.evaluate(() => document.querySelector('.al-exp').getAttribute('aria-expanded'))) === 'true' && (await p.evaluate(() => !document.querySelector('.al-detail').hidden)), 'keyboard only: Tab reaches the expand button, Enter opens the before/after');
    if(SHOTS){ await p.setViewportSize({ width: 1100, height: 700 }); await sleep(400); await p.screenshot({ path: path.join(SHOTS, 'activity-light.png') }); await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await p.screenshot({ path: path.join(SHOTS, 'activity-dark.png') }); await p.evaluate(() => document.documentElement.removeAttribute('data-theme')); }
    await p.context().close();
    const m2 = mk(); seed(m2, Array.from({ length: 6 }, (_, i) => ({ at: new Date(d0 + (i + 1) * 1000).toISOString(), by: i % 2 ? 'Royce' : 'Lynton', area: ['contacts', 'quotes', 'projects'][i % 3], summary: 'Edited quote BWR00' + i + ': project Step Replacement long name that wraps → Step Replacement v' + i, record_label: 'BWR00' + i, changes: [{ field: 'project', from: 'Step Replacement', to: 'Step Replacement v' + i }] })));
    const q = await newPage(browser, m2, { ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true } }); await open(q, url); await gotoActivity(q); await waitRows(q, 6);
    const g = await q.evaluate(() => { const r = [...document.querySelectorAll('#alList .al-row')].map(x => x.getBoundingClientRect()); const f = document.querySelector('.al-filters').getBoundingClientRect(); const sw = document.documentElement.scrollWidth; return { right: Math.max(...r.map(x => x.right)), iw: innerWidth, filtersRight: f.right, sw, sticky: getComputedStyle(document.querySelector('.al-day')).top }; });
    const cb = await q.evaluate(() => { const i = document.querySelector('.al-chk input').getBoundingClientRect(), t = document.querySelector('.al-chk span').getBoundingClientRect(); return { w: i.width, gap: t.left - i.right }; });
    chk(g.right <= g.iw + 1 && g.filtersRight <= g.iw + 1 && cb.w <= 48 && cb.gap < 16, 'phone width (390): rows and filters stay inside the screen; checkboxes use the app\'s own 48 px tap area, label right beside it');
    if(SHOTS){ await q.evaluate(() => window.scrollTo(0, 0)); await sleep(500); await q.screenshot({ path: path.join(SHOTS, 'activity-phone.png') }); }
    rec('10', 'Activity screen: loading, empty, error and retry; phone width; dark and light; keyboard and labels', ok, notes.join('; '));
    await q.context().close();
  });

  { const ids = new Set(); H.allMocks.forEach(m => { m.ids.forEach(i => ids.add('tracker_data ' + i)); m.actDocIds.forEach(i => ids.add('activity_log ' + i)); }); const bad = [...ids].filter(i => i.split(' ')[1] !== 'eq.' + H.DOCID);
    rec('ENV', 'Only this build\'s own row/doc_id is ever used (DOC_ID ' + H.DOCID + ')', bad.length === 0 && ids.size > 0, 'all requests in this run used: ' + [...ids].join(', ')); }
  await browser.close(); srv.close();
  const pass = rows.filter(r => r.pass).length;
  const md = '| # | Test | Result | Evidence |\n|---|---|---|---|\n' + rows.map(r => `| ${r.id} | ${r.name} | ${r.pass ? 'PASS' : '**FAIL**'} | ${String(r.note || '').replace(/\|/g, '/')} |`).join('\n') + `\n\n${pass}/${rows.length} passed\n`;
  if(OUT) fs.writeFileSync(OUT, md);
  console.log('\n' + pass + '/' + rows.length + ' passed'); process.exit(pass === rows.length ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(2); });
