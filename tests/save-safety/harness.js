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
const allMocks = [];
class Mock {
  constructor(doc, opts){ opts = opts || {}; allMocks.push(this); this.ids = new Set(); this.doc = doc; this.version = 1; this.hasVersion = opts.hasVersion !== false; this.hasSnapshots = !!opts.snapshots; this.snapshots = opts.snapshots || [];
    this.updated_at = new Date().toISOString(); this.failPatch = 0; this.down = false; this.log = []; this.patchBodies = []; this.patchUrls = []; this.peeks = 0; this.fullGets = 0; this.snapUrls = []; this.users = { 'admin.example@example.invalid': { pw: 'fake-admin-pass-0001', id: 'u-admin', name: 'Test Admin', role: 'admin', active: true },
      'member.example@example.invalid': { pw: 'fake-member-pass-0002', id: 'u-member', name: 'Test Member', role: 'member', active: true },
      'inactive.example@example.invalid': { pw: 'fake-inactive-pass-0003', id: 'u-inactive', name: 'Test Inactive', role: 'member', active: false },
      'outsider.example@example.invalid': { pw: 'fake-outsider-pass-0004', id: 'u-outsider', name: '', role: '', active: false, noRow: true } };
    this.valid = new Map(); this.refreshTok = new Map(); this.tokN = 0; this.ttl = 3600; this.refreshCalls = 0; this.failRefresh = null; this.refreshDelay = 0; this.reqLog = []; this.authLog = []; this.pwChanges = []; this.badAuthRequests = 0; this.memberReadsBlocked = 0; this.logouts = 0;
    this.hasActivity = opts.activity !== false; this.activity = []; this.failActivity = 0; this.loseAck = 0; this.activityPosts = []; this.activityGets = []; this.actDocIds = new Set(); }
  other(mutator){ const d = JSON.parse(JSON.stringify(this.doc)); mutator(d); this.doc = d; this.version++; this.updated_at = new Date(Date.now() + 1000).toISOString(); }   // another writer saved
  row(cols){ const o = {}; cols.split(',').forEach(c => { if(c === 'doc') o.doc = this.doc; else if(c === 'updated_at') o.updated_at = this.updated_at; else if(c === 'version') o.version = this.version; else if(c === 'id') o.id = DOCID; }); return o; }
  userById(id){ const e = Object.keys(this.users).find(k => this.users[k].id === id); return e ? Object.assign({ email: e }, this.users[e]) : null; }
  issue(uid){ const n = ++this.tokN, at = 'at.' + uid + '.' + n, rt = 'rt.' + uid + '.' + n; this.valid.set(at, uid); this.refreshTok.set(rt, { uid, used: false }); return { access_token: at, refresh_token: rt }; }
  expire(token){ this.valid.delete(token); }
  expireAll(){ this.valid.clear(); }
  /* a signed-in blob for a test page (the same shape the portal stores), so a test starts "already signed in" without a password */
  presetTokens(which){ const email = which === 'member' ? 'member.example@example.invalid' : which === 'inactive' ? 'inactive.example@example.invalid' : which === 'outsider' ? 'outsider.example@example.invalid' : 'admin.example@example.invalid'; const u = this.users[email], t = this.issue(u.id); return Object.assign(t, { user_id: u.id, email, member: u.noRow ? null : { display_name: u.name, role: u.role } }); }
  async handle(route){
    const req = route.request(), u = new URL(req.url()), m = req.method();
    const send = (status, body) => route.fulfill({ status, headers: Object.assign({ 'content-type': 'application/json' }, CORS), body: JSON.stringify(body) });
    if(m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if(this.down) return route.abort('failed');
    const hdr = req.headers(), bearer = (hdr['authorization'] || '').replace(/^Bearer\s+/i, '');
    if(u.pathname.indexOf('/auth/v1/') === 0){
      const body = req.postData() ? JSON.parse(req.postData()) : {}, gt = u.searchParams.get('grant_type'), ac = u.pathname.replace('/auth/v1/', '');
      this.authLog.push({ ep: ac, grant: gt, apikey: !!hdr['apikey'], url: req.url() });
      if(ac === 'token' && gt === 'password'){
        const us = this.users[String(body.email || '').toLowerCase()];
        if(!us || us.pw !== body.password){ this.authLog[this.authLog.length - 1].ok = false; return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' }); }
        this.authLog[this.authLog.length - 1].ok = true; const t = this.issue(us.id); return send(200, Object.assign(t, { expires_in: this.ttl, token_type: 'bearer', user: { id: us.id, email: String(body.email).toLowerCase() } }));
      }
      if(ac === 'token' && gt === 'refresh_token'){
        this.refreshCalls++; if(this.refreshDelay) await new Promise(r => setTimeout(r, this.refreshDelay));
        if(this.failRefresh === 500) return send(500, { message: 'server error' });
        const e = this.refreshTok.get(body.refresh_token);
        if(this.failRefresh === 'invalid' || !e || e.used) return send(400, { error: 'invalid_grant', error_description: e && e.used ? 'Invalid Refresh Token: Already Used' : 'Invalid Refresh Token: Refresh Token Not Found' });
        e.used = true; const t = this.issue(e.uid); return send(200, Object.assign(t, { expires_in: this.ttl, token_type: 'bearer', user: { id: e.uid, email: (this.userById(e.uid) || {}).email } }));
      }
      if(ac === 'user' && m === 'PUT'){ if(!this.valid.has(bearer)) return send(401, { msg: 'invalid JWT' }); this.pwChanges.push({ length: String(body.password || '').length }); return send(200, { id: this.valid.get(bearer) }); }
      if(ac === 'logout'){ this.logouts++; this.valid.delete(bearer); return route.fulfill({ status: 204, headers: CORS, body: '' }); }
      return send(404, { message: 'unmocked auth' });
    }
    // every data request must carry a valid signed-in token (the real database refuses anyone else)
    const who = this.valid.has(bearer) ? this.userById(this.valid.get(bearer)) : null;
    this.reqLog.push({ method: m, path: u.pathname, auth: !!who });
    if(!hdr['apikey'] || !bearer || !who){ this.badAuthRequests++; return send(401, { code: 'PGRST301', message: bearer ? 'JWT expired' : 'No API key found in request' }); }
    const isMember = !!(who && !who.noRow && who.active), isAdminU = isMember && who.role === 'admin';
    const p = u.pathname.replace('/rest/v1/', '');
    if(p === 'rpc/app_whoami'){ return send(200, who.noRow ? [] : [{ display_name: who.name, role: who.role, active: who.active }]); }
    if(p === 'app_members'){
      if(!isMember) return send(200, []);
      if(m === 'GET'){ const all = Object.keys(this.users).filter(k => !this.users[k].noRow).map(k => ({ user_id: this.users[k].id, email: k, display_name: this.users[k].name, role: this.users[k].role, active: this.users[k].active })); return send(200, isAdminU ? all : all.filter(r => r.user_id === who.id)); }
      if(m === 'PATCH'){ if(!isAdminU) return send(200, []); const uid = (u.searchParams.get('user_id') || '').replace('eq.', ''), b = JSON.parse(req.postData()), us = Object.values(this.users).find(z => z.id === uid); if(!us) return send(200, []); if('active' in b) us.active = !!b.active; if('display_name' in b) us.name = b.display_name; return route.fulfill({ status: 204, headers: CORS, body: '' }); }
    }
    if(!isMember && p !== 'tracker_data') return send(200, []);
    if(!isMember) return m === 'GET' ? send(200, []) : send(200, []);
    if((p === 'tracker_snapshots' || (p === 'activity_log' && m === 'GET')) && !isAdminU){ this.memberReadsBlocked++; return send(200, []); }
    if(p === 'activity_log' && m === 'POST'){ const rowsIn = JSON.parse(req.postData()); if(rowsIn.some(r => r.by !== who.name)) return send(403, { code: '42501', message: 'new row violates row-level security policy for table "activity_log"' }); }
    if(p === 'tracker_data'){
      this.ids.add(u.searchParams.get('id'));
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
    if(p === 'activity_log'){
      if(!this.hasActivity) return send(404, { code: 'PGRST205', message: "Could not find the table 'public.activity_log' in the schema cache" });
      if(m === 'GET') this.actDocIds.add(u.searchParams.get('doc_id'));
      if(m === 'POST'){
        const rows = JSON.parse(req.postData()); rows.forEach(r => this.actDocIds.add('eq.' + r.doc_id)); this.activityPosts.push(rows.map(r => r.id));
        if(this.failActivity) return send(typeof this.failActivity === 'number' ? this.failActivity : 500, { message: 'mock log failure' });
        const ign = /ignore-duplicates/.test(req.headers()['prefer'] || ''); const dup = rows.some(r => this.activity.some(a => a.id === r.id));
        if(dup && !ign) return send(409, { code: '23505', message: 'duplicate key value violates unique constraint "activity_log_pkey"' });   // a plain insert of a stored id, as Postgres does
        rows.forEach(r => { if(!this.activity.some(a => a.id === r.id)) this.activity.push(Object.assign({ at: new Date().toISOString() }, r)); });
        if(this.loseAck > 0){ this.loseAck--; return send(500, { message: 'ack lost after insert' }); }
        return route.fulfill({ status: 201, headers: CORS, body: '' });
      }
      if(m === 'GET'){
        this.activityGets.push(req.url());
        const sp = u.searchParams, lim = Number(sp.get('limit') || 1000); let rs = this.activity.filter(a => String(a.doc_id) === (sp.get('doc_id') || '').replace('eq.', ''));
        const eqv = k => (sp.get(k) || '').replace(/^eq\./, ''), by = sp.get('by'), area = sp.get('area'), act = sp.get('action'), at = sp.get('at');
        if(by) rs = rs.filter(a => a.by === eqv('by')); if(area) rs = rs.filter(a => a.area === eqv('area')); if(act && /^neq\./.test(act)) rs = rs.filter(a => a.action !== act.replace('neq.', ''));
        if(at && /^gte\./.test(at)) rs = rs.filter(a => Date.parse(a.at) >= Date.parse(at.replace('gte.', '')));
        const and = sp.get('and') || '';
        let mm = and.match(/summary\.ilike\."\*(.*?)\*",record_label\.ilike\."\*(.*?)\*"/); if(mm){ const q = mm[1].toLowerCase(); rs = rs.filter(a => String(a.summary || '').toLowerCase().includes(q) || String(a.record_label || '').toLowerCase().includes(q)); }
        mm = and.match(/at\.lt\."([^"]+)",and\(at\.eq\."[^"]+",id\.lt\."([^"]+)"/); if(mm){ const t = Date.parse(mm[1]), id = mm[2]; rs = rs.filter(a => Date.parse(a.at) < t || (Date.parse(a.at) === t && a.id < id)); }
        rs.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (a.id < b.id ? 1 : -1));
        return send(200, rs.slice(0, lim));
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
  const preset = o.noSession ? null : mock.presetTokens(o.user || 'admin');
  await ctx.addInitScript(([k, blob]) => { try{ window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); if(blob && !sessionStorage.getItem('__preset') && !localStorage.getItem(k)){ sessionStorage.setItem('__preset', '1'); blob.expires_at = Math.floor(Date.now() / 1000) + 3600; localStorage.setItem(k, JSON.stringify(blob)); } }catch(e){} }, [PREFIX + 'business-tracker-auth', preset]);
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
module.exports = { allMocks, serve, Mock, newPage, chip, waitState, open, baseDoc, DOCID, PREFIX, SB, HTML, chromium };
