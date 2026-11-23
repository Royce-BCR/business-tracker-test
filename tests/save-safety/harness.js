/* Test harness for Save Safety. Serves index.html locally and mocks every Supabase call with page.route, so nothing leaves the machine.
   Usage: HTML=/path/to/index.html DOCID=2 PREFIX=bt-test- node run.js */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const SB = 'https://dunbyxxpgpfewvelwtpv.supabase.co';
const HTML = process.env.HTML || path.join(__dirname, '../../index.html');
const DOCID = Number(process.env.DOCID || 2), PREFIX = process.env.PREFIX !== undefined ? process.env.PREFIX : 'bt-test-';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };

function serve(){
  return new Promise(res => { const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(HTML)); }).listen(0, '127.0.0.1', () => res({ srv, url: 'http://127.0.0.1:' + srv.address().port + '/' })); });
}
/* an in-memory stand-in for the tracker_data row, with the same compare-and-swap behaviour as the real trigger */
class Mock {
  constructor(doc, opts){ opts = opts || {}; this.doc = doc; this.version = 1; this.hasVersion = opts.hasVersion !== false; this.hasSnapshots = !!opts.snapshots; this.snapshots = opts.snapshots || [];
    this.updated_at = new Date().toISOString(); this.failPatch = 0; this.down = false; this.log = []; this.patchBodies = []; this.patchUrls = []; this.peeks = 0; this.fullGets = 0; this.snapUrls = []; }
  other(mutator){ const d = JSON.parse(JSON.stringify(this.doc)); mutator(d); this.doc = d; this.version++; this.updated_at = new Date(Date.now() + 1000).toISOString(); }   // another writer saved
  row(cols){ const o = {}; cols.split(',').forEach(c => { if(c === 'doc') o.doc = this.doc; else if(c === 'updated_at') o.updated_at = this.updated_at; else if(c === 'version') o.version = this.version; else if(c === 'id') o.id = DOCID; }); return o; }
  async handle(route){
    const req = route.request(), u = new URL(req.url()), m = req.method();
    const send = (status, body) => route.fulfill({ status, headers: Object.assign({ 'content-type': 'application/json' }, CORS), body: JSON.stringify(body) });
    if(m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if(this.down) return route.abort('failed');
    const p = u.pathname.replace('/rest/v1/', '');
    if(p === 'tracker_data'){
      const sel = u.searchParams.get('select') || 'doc,updated_at', ver = (u.searchParams.get('version') || '').replace(/^eq\./, '') || null;
      if((!this.hasVersion) && (/version/.test(sel) || ver)) return send(400, { code: '42703', message: 'column tracker_data.version does not exist' });
      if(m === 'GET'){ if(sel === 'doc,updated_at' || sel === 'doc,updated_at,version') this.fullGets++; else this.peeks++; this.log.push('GET ' + sel); return send(200, [this.row(sel)]); }
      if(m === 'PATCH'){
        const body = JSON.parse(req.postData()); this.patchBodies.push(body); this.patchUrls.push(u.search); this.log.push('PATCH' + (ver ? ' v=' + ver : ''));
        if(this.failPatch){ return send(typeof this.failPatch === 'number' ? this.failPatch : 500, { message: 'mock failure' }); }
        if(ver !== null && Number(ver) !== this.version) return send(200, []);
        this.doc = body.doc; if(this.hasVersion){ this.version++; this.updated_at = new Date().toISOString(); } else this.updated_at = body.updated_at || this.updated_at;
        return send(200, [this.row(sel)]);
      }
    }
    if(p === 'tracker_snapshots'){
      if(!this.hasSnapshots) return send(404, { code: 'PGRST205', message: "Could not find the table 'public.tracker_snapshots' in the schema cache" });
      if(!u.searchParams.get('id')) this.snapUrls.push(req.url());
      const idq = u.searchParams.get('id'); if(idq){ const s = this.snapshots.find(x => 'eq.' + x.id === idq); return send(200, s ? [{ doc: s.doc, taken_at: s.taken_at }] : []); }
      return send(200, this.snapshots.map(s => ({ id: s.id, taken_at: s.taken_at, reason: s.reason, bytes: s.bytes, counts: s.counts })));
    }
    return send(404, { message: 'unmocked ' + p });
  }
}
async function newPage(browser, mock, o){
  o = o || {};
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }, o.ctx || {}));
  await ctx.addInitScript(([k]) => { try{ if(!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ username: 'tester', role: 'admin' })); }catch(e){} }, [PREFIX + 'business-tracker-session']);
  const page = await ctx.newPage();
  page.errors = []; page.consoleErrors = []; page.consoleWarns = []; page.dialogs = []; page.downloads = [];
  page.on('pageerror', e => page.errors.push(String(e.stack || e).split('\n').slice(0,4).join(' | ')));
  page.on('console', m => { if(m.type() === 'error') page.consoleErrors.push(m.text()); if(m.type() === 'warning') page.consoleWarns.push(m.text()); });
  page.on('dialog', d => { page.dialogs.push(d.type()); d.accept().catch(() => {}); });
  page.on('download', d => page.downloads.push(d));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.route(SB + '/**', r => mock.handle(r));
  if(o.clock) await page.clock.install({ time: new Date('2026-11-23T10:00:00Z') });
  return page;
}
const chip = page => page.evaluate(() => ({ state: document.getElementById('syncChip').dataset.state, text: document.getElementById('syncTxt').textContent, hidden: document.getElementById('syncWrap').hidden }));
const waitState = (page, st, ms) => page.waitForFunction(s => document.getElementById('syncChip') && document.getElementById('syncChip').dataset.state === s && !document.getElementById('syncWrap').hidden, st, { timeout: ms || 8000 });
async function open(page, url, o){ await page.goto(url); await page.waitForFunction(() => (typeof sync === 'undefined' || sync.started) && typeof state !== 'undefined' && state, null, { timeout: 20000 }); }
function baseDoc(n){   // a document made from the app's own defaults plus n contacts, so it has realistic shape
  return (async () => { const b = await chromium.launch(); const m = new Mock({}); const { srv, url } = await serve(); const pg = await newPage(b, m); await open(pg, url);
    const doc = await pg.evaluate(count => { for(let i = 1; i <= count; i++) cxNewContact({ firstName: 'Seed', lastName: 'Contact ' + i, email: 'seed' + i + '@example.com' }); return JSON.parse(JSON.stringify(state)); }, n || 40);
    await b.close(); srv.close(); return doc; })();
}
module.exports = { serve, Mock, newPage, chip, waitState, open, baseDoc, DOCID, PREFIX, SB, HTML, chromium };
