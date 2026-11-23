/* Regression checks that the existing behaviour is unchanged: live refresh, lead panel status, undo, nav persistence.
   Run the same file against the ORIGINAL build and the NEW build and compare:  HTML=... node regress.js */
const H = require('./harness'); const { Mock, newPage, open, serve, waitState, chromium } = H;
const clone = o => JSON.parse(JSON.stringify(o)); const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const doc = await H.baseDoc(40); const browser = await chromium.launch(); const { srv, url } = await serve(); const out = {};
  const settle = async (p, ms) => { await sleep(ms || 1500); };
  const lpText = p => p.evaluate(() => document.getElementById('lpSaved').textContent);
  // R1 live refresh applies other people's changes quietly when nothing is unsaved
  { const m = new Mock(clone(doc)), p = await newPage(browser, m, { clock: true }); await open(p, url);
    m.other(d => { d.settings.leadStaleDays = 99; });
    let ok = false; for(let i = 0; i < 6 && !ok; i++){ await p.clock.runFor(30000); await sleep(400); ok = (await p.evaluate(() => state.settings.leadStaleDays)) === 99; }
    out.R1_live_refresh_applies = ok && p.dialogs.length === 0;
    // and does NOT apply over unsaved work
    m.failPatch = 500; await p.evaluate(() => { state.settings.leadStaleDays = 12; saveState(); }); await sleep(800); m.failPatch = 0; m.other(d => { d.settings.leadStaleDays = 98; });
    for(let i = 0; i < 4; i++){ await p.clock.runFor(30000); await sleep(300); }
    out.R1_live_refresh_keeps_unsaved = (await p.evaluate(() => state.settings.leadStaleDays)) === 12;
    await p.context().close(); }
  // R2 lead panel status label
  { const m = new Mock(clone(doc)), p = await newPage(browser, m); await open(p, url);
    await p.evaluate(() => { const l = state.leads[0]; openLeadPanel(l.id); });
    await p.waitForSelector('#lpSaved', { state: 'attached' });
    await p.evaluate(() => { state.settings.leadStaleDays = 31; saveState(); }); await settle(p, 1200); out.R2_lp_saved = await lpText(p);
    m.failPatch = 500; await p.evaluate(() => { state.settings.leadStaleDays = 32; saveState(); }); await settle(p, 1200); out.R2_lp_failed = await lpText(p); m.failPatch = 0;
    m.other(d => { d.settings.leadStaleDays = 77; }); await p.evaluate(() => { state.settings.leadStaleDays = 33; saveState(); }); await settle(p, 1500); out.R2_lp_blocked = await lpText(p);
    await p.context().close(); }
  // R3 undo log round-trips through save and reload
  { const m = new Mock(clone(doc)), p = await newPage(browser, m); await open(p, url);
    await p.evaluate(() => { const it = state.contacts.splice(0, 1)[0]; undoDeleted('Deleted a contact', ['contacts'], 0, it, null, true); }); await settle(p, 1200);
    out.R3_undo_saved = m.doc.undoLog && m.doc.undoLog.length === 1 && m.doc.contacts.length === 39;
    await p.reload(); await p.waitForFunction(() => typeof state !== 'undefined' && state && state.undoLog); await sleep(300);
    out.R3_undo_after_reload = await p.evaluate(() => state.undoLog.length);
    await p.evaluate(() => undoRestore(state.undoLog[0].id)); await settle(p, 1200); out.R3_undo_restored = (await p.evaluate(() => state.contacts.length)) === 40 && m.doc.contacts.length === 40;
    await p.context().close(); }
  // R4 navigation persistence across a refresh
  { const m = new Mock(clone(doc)), p = await newPage(browser, m); await open(p, url);
    await p.evaluate(() => { activateTab('leads'); }); await sleep(500);
    const before = await p.evaluate(() => navTabName()); await p.reload(); await p.waitForFunction(() => typeof state !== 'undefined' && state && document.querySelector('.panel.active')); await sleep(800);
    out.R4_nav_tab_before = before; out.R4_nav_tab_after_reload = await p.evaluate(() => navTabName());
    await p.context().close(); }
  console.log(JSON.stringify(out, null, 1)); await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(2); });
