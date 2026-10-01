/* PT評価記録 — データは端末内（IndexedDB）にのみ保存し、外部へは送信しない */
(function () {
  'use strict';

  const APP_VERSION = '1.1.0';
  const PTA = window.PTA;
  const DOMAINS = PTA.domains;
  const EX = PTA.exercises;
  const SIDES = ['R', 'L'];
  const SIDE_JA = { R: '右', L: '左' };
  const G_NOTE = '_general.note';
  const G_CLIENT = '_general.client';
  const DAY = 864e5;
  const GOAL_PRESETS = ['姿勢改善', '腰痛', '肩こり', '膝の痛み', '体力向上', '柔軟性向上', '産後ケア', 'スポーツ'];
  const DEFAULT_EX_COUNT = 3;

  const $app = document.getElementById('app');
  const $toast = document.getElementById('toast');

  // ---------------------------------------------------------------- utils
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const pad = n => String(n).padStart(2, '0');
  const round1 = n => Math.round(n * 10) / 10;
  const hasValue = v => v !== undefined && v !== null && v !== '' && v !== false && !(Array.isArray(v) && !v.length);

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const fmtDate = s => (s || '').replace(/-/g, '/');
  const fmtShort = s => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(s || ''); return m ? `${+m[1]}/${+m[2]}` : s; };
  function fmtDateTime(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  let toastTimer;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $toast.classList.remove('show'), 2200);
  }

  const fit = t => { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; };

  // ---------------------------------------------------------------- 項目定義の索引
  const itemKey = (d, s, i) => `${d.id}.${s.id}.${i.id}`;
  const noteKey = (d, s) => `${d.id}.${s.id}._note`;
  function fieldsOf(d, s, i) {
    const k = itemKey(d, s, i);
    return i.bilateral ? SIDES.map(side => ({ key: `${k}.${side}`, side })) : [{ key: k, side: '' }];
  }

  const FIELDS = {}; // key -> {d, s, i, side}
  for (const d of DOMAINS) {
    for (const s of d.sections) {
      for (const i of s.items) for (const f of fieldsOf(d, s, i)) FIELDS[f.key] = { d, s, i, side: f.side };
      FIELDS[noteKey(d, s)] = { d, s, i: { label: 'メモ', type: 'text' }, side: '' };
    }
  }
  FIELDS[G_NOTE] = { d: { label: '全体' }, s: { label: '総合' }, i: { label: '総合所見', type: 'text' }, side: '' };
  FIELDS[G_CLIENT] = { d: { label: '全体' }, s: { label: '総合' }, i: { label: 'クライアントへのひとこと', type: 'text' }, side: '' };

  const optionOf = (i, v) => (i.options || []).find(o => o.v === v);

  function fmtValue(i, v) {
    if (!hasValue(v)) return '';
    switch (i.type) {
      case 'check': return 'あり';
      case 'choice': { const o = optionOf(i, v); return o ? o.label : String(v); }
      case 'multi': return v.map(x => { const o = optionOf(i, x); return o ? o.label : x; }).join('・');
      case 'number': case 'scale': return `${v}${i.unit || ''}`;
      default: return String(v);
    }
  }

  // ---------------------------------------------------------------- 保存（IndexedDB）
  const DB = (() => {
    let db;
    const open = () => new Promise((res, rej) => {
      const r = indexedDB.open('pt-assessment', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('clients', { keyPath: 'id' });
        d.createObjectStore('assessments', { keyPath: 'id' });
        d.createObjectStore('meta', { keyPath: 'key' });
      };
      r.onsuccess = () => { db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
    const tx = (store, mode, fn) => new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const rq = fn(t.objectStore(store));
      t.oncomplete = () => res(rq && rq.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
    return {
      open,
      all: s => tx(s, 'readonly', o => o.getAll()),
      put: (s, v) => tx(s, 'readwrite', o => o.put(v)),
      del: (s, k) => tx(s, 'readwrite', o => o.delete(k))
    };
  })();

  const S = { clients: [], assessments: [], meta: {} };

  async function loadAll() {
    S.clients = await DB.all('clients');
    S.assessments = await DB.all('assessments');
    S.meta = {};
    for (const m of await DB.all('meta')) S.meta[m.key] = m.value;
  }
  function setMeta(k, v) { S.meta[k] = v; return DB.put('meta', { key: k, value: v }); }
  const touch = () => setMeta('lastChange', Date.now());

  const clientById = id => S.clients.find(c => c.id === id);
  const assessById = id => S.assessments.find(a => a.id === id);
  // 古い順
  function assessmentsOf(cid) {
    return S.assessments.filter(a => a.clientId === cid)
      .sort((x, y) => x.date === y.date ? x.createdAt - y.createdAt : (x.date < y.date ? -1 : 1));
  }
  function prevOf(a) {
    const list = assessmentsOf(a.clientId);
    const idx = list.indexOf(a);
    return idx > 0 ? list[idx - 1] : null;
  }
  const hasAny = a => Object.values(a.values).some(hasValue);

  async function persistAssessment(a) {
    a.updatedAt = Date.now();
    await DB.put('assessments', a);
    await touch();
  }
  async function removeAssessment(a) {
    S.assessments = S.assessments.filter(x => x !== a);
    await DB.del('assessments', a.id);
    await touch();
  }
  async function saveClient(c) {
    if (!clientById(c.id)) S.clients.push(c);
    await DB.put('clients', c);
    await touch();
  }
  async function removeClient(c) {
    for (const a of assessmentsOf(c.id)) await DB.del('assessments', a.id);
    S.assessments = S.assessments.filter(a => a.clientId !== c.id);
    S.clients = S.clients.filter(x => x !== c);
    await DB.del('clients', c.id);
    await touch();
  }

  function backupDue() {
    const lc = S.meta.lastChange, lb = S.meta.lastBackup || 0;
    return S.assessments.length > 0 && lc && lc > lb && Date.now() - lb > 7 * DAY;
  }

  // ---------------------------------------------------------------- 比較
  function sectionObserved(x, d, s) {
    return !!x && s.items.some(i => fieldsOf(d, s, i).some(f => hasValue(x.values[f.key])));
  }

  // 戻り値 {st: 'better'|'worse'|'same'|'changed'|'', delta, label}
  function compare(i, pv, cv, prevObs, curObs) {
    const hp = hasValue(pv), hc = hasValue(cv);
    if (!hp && !hc) return null;
    if (i.type === 'text') return { st: '' };
    if (hp && hc) {
      if (i.type === 'number' || i.type === 'scale') {
        const d = round1(cv - pv);
        if (!d) return { st: 'same', delta: '±0' };
        const delta = (d > 0 ? '+' : '−') + Math.abs(d);
        if (!i.better) return { st: 'changed', delta };
        return { st: (i.better === 'high' ? d > 0 : d < 0) ? 'better' : 'worse', delta };
      }
      if (i.type === 'choice') {
        if (pv === cv) return { st: 'same' };
        const sp = (optionOf(i, pv) || {}).score, sc = (optionOf(i, cv) || {}).score;
        if (sp != null && sc != null && sp !== sc) return { st: sc > sp ? 'better' : 'worse' };
        return { st: 'changed' };
      }
      if (i.type === 'multi') {
        const same = pv.length === cv.length && pv.every(x => cv.includes(x));
        return { st: same ? 'same' : 'changed' };
      }
      return { st: 'same' };
    }
    if (i.finding) {
      if (hc && prevObs) return { st: 'worse', label: '新規' };
      if (hp && curObs) return { st: 'better', label: '消失' };
    }
    return { st: '' };
  }
  const ST_LABEL = { better: '改善', worse: '低下', same: '変化なし', changed: '変化' };
  const signed = d => (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d);

  // 合計点を出すセクション（section.score あり）の集計。小計は item.group ごと
  function scoreOf(x, d, s) {
    if (!s.score || !x) return null;
    const groups = [];
    const tot = { sum: 0, n: 0, N: 0, max: 0 };
    for (const i of s.items) {
      if (i.type !== 'scale') continue;
      let g = groups.find(k => k.label === (i.group || ''));
      if (!g) groups.push(g = { label: i.group || '', sum: 0, n: 0, N: 0, max: 0 });
      for (const f of fieldsOf(d, s, i)) {
        const v = x.values[f.key];
        for (const t of [g, tot]) {
          t.N++; t.max += i.max;
          if (hasValue(v)) { t.n++; t.sum += v; }
        }
      }
    }
    if (!tot.n) return null;
    return { ...tot, complete: tot.n === tot.N, groups };
  }
  // 全項目そろっていれば「45/56」、途中なら「30点（10/14項目）」
  const scoreText = sc => (sc.n === sc.N ? `${sc.sum}/${sc.max}` : `${sc.sum}点（${sc.n}/${sc.N}項目）`);
  const scoreGroup = (sc, label) => (sc ? sc.groups.find(g => g.label === label && g.n) : null) || null;

  function recordScore(d, s, a, prev) {
    const sc = scoreOf(a, d, s);
    if (!sc) return '';
    const ps = scoreOf(prev, d, s);
    let t = `${s.score.label} ${scoreText(sc)}`;
    if (ps && ps.complete && sc.complete) t += `(${signed(sc.sum - ps.sum)})`;
    if (sc.complete && s.score.percent) t += `（${round1(sc.sum / sc.max * 100)}%）`;
    const named = sc.groups.filter(g => g.label && g.n);
    if (named.length) t += '\n' + named.map(g => `${g.label} ${scoreText(g)}`).join('、');
    const lost = [];
    for (const i of s.items) for (const f of fieldsOf(d, s, i)) {
      const v = a.values[f.key];
      if (i.type === 'scale' && hasValue(v) && v < i.max) lost.push(`${i.label}${f.side ? f.side : ''} ${v}`);
    }
    if (lost.length) t += `\n減点：${lost.join('、')}`;
    return t;
  }

  // ---------------------------------------------------------------- 出力①：記録文
  function getter(x, d, s) {
    return id => {
      const i = s.items.find(k => k.id === id);
      if (!i || !x) return undefined;
      const k = itemKey(d, s, i);
      if (i.bilateral) {
        const R = x.values[`${k}.R`], L = x.values[`${k}.L`];
        if (!hasValue(R) && !hasValue(L)) return undefined;
        return { R: hasValue(R) ? R : null, L: hasValue(L) ? L : null };
      }
      const v = x.values[k];
      return hasValue(v) ? v : undefined;
    };
  }

  function diffText(i, key, a, prev) {
    if (!prev || (i.type !== 'number' && i.type !== 'scale')) return '';
    const r = compare(i, prev.values[key], a.values[key]);
    return r && r.delta && hasValue(prev.values[key]) && hasValue(a.values[key]) ? `(${r.delta})` : '';
  }

  function recordItem(d, s, i, a, prev) {
    const k = itemKey(d, s, i);
    const label = i.short || i.label;
    const V = key => a.values[key];
    if (!i.bilateral) {
      const v = V(k);
      if (!hasValue(v)) return '';
      switch (i.type) {
        case 'check': return label;
        case 'choice': { const o = optionOf(i, v); return o ? (o.rec || label + o.label) : ''; }
        case 'multi': return `${label}：${fmtValue(i, v)}`;
        case 'number': case 'scale': return `${label} ${v}${i.unit || ''}${diffText(i, k, a, prev)}`;
        default: return `${label}：${v}`;
      }
    }
    const got = SIDES.filter(sd => hasValue(V(`${k}.${sd}`)));
    if (!got.length) return '';
    if (i.type === 'check') return `${label}（${got.length === 2 ? '両側' : got[0]}）`;
    if (i.type === 'choice') {
      const lab = sd => fmtValue(i, V(`${k}.${sd}`));
      if (got.length === 2 && V(`${k}.R`) === V(`${k}.L`)) return `${label}${lab('R')}（両側）`;
      if (got.length === 1) return `${label}${lab(got[0])}（${got[0]}）`;
      return `${label} R:${lab('R')}/L:${lab('L')}`;
    }
    const parts = got.map(sd => `${sd}${V(`${k}.${sd}`)}${diffText(i, `${k}.${sd}`, a, prev)}`);
    return `${label} ${parts.join('/')}${i.unit || ''}`;
  }

  function buildRecord(a, prev, withDiff) {
    const c = clientById(a.clientId);
    const p = withDiff ? prev : null;
    const lines = [`【評価記録】${fmtDate(a.date)}　${c.name}${hasValue(c.age) ? `（${c.age}歳）` : ''}`];
    if (c.goal) lines.push(`目的：${c.goal}`);
    if (p) lines.push(`※( )内は前回（${fmtDate(p.date)}）比`);
    for (const d of DOMAINS) {
      for (const s of d.sections) {
        let parts;
        if (s.score) {
          const t = recordScore(d, s, a, p);
          parts = t ? [t] : [];
        } else if (s.record) {
          const diff = id => { const i = s.items.find(x => x.id === id); return i ? diffText(i, itemKey(d, s, i), a, p) : ''; };
          const t = s.record(getter(a, d, s), diff);
          parts = t ? [t] : [];
        } else {
          parts = s.items.map(i => recordItem(d, s, i, a, p)).filter(Boolean);
        }
        const note = a.values[noteKey(d, s)];
        if (!parts.length && !hasValue(note)) continue;
        lines.push(`■${s.label}`);
        if (parts.length) lines.push(parts.join('、'));
        if (hasValue(note)) lines.push(`メモ：${note}`);
      }
    }
    if (hasValue(a.values[G_NOTE])) lines.push('■総合所見', a.values[G_NOTE]);
    return lines.join('\n');
  }

  // ---------------------------------------------------------------- 出力②：クライアント向け
  function collectFindings(a) {
    const out = [];
    const add = (r, defEx) => {
      if (!r) return;
      if (Array.isArray(r)) { r.forEach(x => add(x, defEx)); return; }
      if (typeof r === 'string') r = { text: r };
      if (r.text) out.push({ text: r.text, ex: r.ex || defEx || [] });
    };
    for (const d of DOMAINS) {
      for (const s of d.sections) {
        const g = getter(a, d, s);
        if (s.score) {
          const sc = scoreOf(a, d, s);
          if (sc && s.score.client) add(s.score.client(sc));
          continue;
        }
        if (s.client) { add(s.client(g)); continue; }
        for (const i of s.items) {
          const v = g(i.id);
          if (v === undefined) continue;
          if (typeof i.client === 'function') add(i.client(v), i.ex);
          else if (i.type === 'choice' && !i.bilateral) {
            const o = optionOf(i, v);
            if (o && o.client) add({ text: o.client, ex: o.ex }, i.ex);
          } else if (typeof i.client === 'string') add(i.client, i.ex);
        }
      }
    }
    return out;
  }

  // 所見から運動候補を作る（複数の所見に共通する運動を優先）
  function exerciseCandidates(findings) {
    const score = new Map();
    findings.forEach(f => f.ex.forEach((id, n) => {
      if (EX[id]) score.set(id, (score.get(id) || 0) + (n === 0 ? 1 : 0.5));
    }));
    return [...score.entries()].sort((x, y) => y[1] - x[1]).map(x => x[0]);
  }

  function collectChanges(a, prev) {
    const out = [];
    if (!prev) return out;
    const tails = { better: '良くなっています', worse: '前回よりやや低下しています' };
    // 合計点のあるセクションは、項目ごとではなく合計の変化だけを伝える
    for (const d of DOMAINS) for (const s of d.sections) {
      const ps = scoreOf(prev, d, s), cs = scoreOf(a, d, s);
      if (ps && cs && ps.complete && cs.complete && ps.sum !== cs.sum) {
        out.push(`・${s.score.plain || s.score.label}：${ps.sum}点 → ${cs.sum}点（${cs.sum > ps.sum ? tails.better : tails.worse}）`);
      }
    }
    for (const d of DOMAINS) for (const s of d.sections) for (const i of s.items) {
      if (s.score) continue;
      const scored = i.type === 'choice' && (i.options || []).some(o => o.score != null);
      if (!i.better && !scored) continue;
      for (const f of fieldsOf(d, s, i)) {
        const pv = prev.values[f.key], cv = a.values[f.key];
        if (!hasValue(pv) || !hasValue(cv)) continue;
        const r = compare(i, pv, cv);
        if (!r || (r.st !== 'better' && r.st !== 'worse')) continue;
        const name = (i.plain || i.label) + (f.side ? `・${SIDE_JA[f.side]}` : '');
        const tail = r.st === 'better' ? '良くなっています' : '前回よりやや低下しています';
        out.push(`・${name}：${fmtValue(i, pv)} → ${fmtValue(i, cv)}（${tail}）`);
      }
    }
    return out;
  }

  function buildClientText(a, prev, exIds) {
    const c = clientById(a.clientId);
    const name = /(さん|様|さま|ちゃん|くん|君)$/.test(c.name) ? c.name : `${c.name}さん`;
    const findings = collectFindings(a);
    const changes = collectChanges(a, prev);
    const blocks = [`${name}\n本日（${fmtShort(a.date)}）の評価結果をお伝えします。`];
    if (findings.length) blocks.push('【からだの状態】\n' + findings.map(f => `・${f.text}`).join('\n'));
    if (changes.length) blocks.push(`【前回（${fmtShort(prev.date)}）からの変化】\n` + changes.join('\n'));
    const exs = exIds.map(id => EX[id]).filter(Boolean);
    if (exs.length) {
      blocks.push('【おすすめの運動】\n' + exs.map((e, n) =>
        `${n + 1}. ${e.name}\n${e.how}\n目安：${e.dose}`).join('\n\n'));
    }
    if (hasValue(a.values[G_CLIENT])) blocks.push(a.values[G_CLIENT]);
    if (exs.length) blocks.push('※痛みが出たり強くなったりする場合は、無理をせず中止してください。');
    return blocks.join('\n\n');
  }

  // ---------------------------------------------------------------- CSV
  const CSV_HEAD = ['client_id', '名前', '年齢', '目的', '登録日時', 'assessment_id', '評価日', '記録日時',
    '領域', 'セクション', '項目', '左右', '値', '単位', 'key', 'raw'];

  const csvCell = v => {
    v = v == null ? '' : String(v);
    return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };

  function buildCSV() {
    const rows = [CSV_HEAD];
    const iso = ts => ts ? new Date(ts).toISOString() : '';
    for (const c of S.clients) {
      const base = [c.id, c.name, hasValue(c.age) ? c.age : '', c.goal || '', iso(c.createdAt)];
      const list = assessmentsOf(c.id);
      if (!list.length) { rows.push(base); continue; }
      for (const a of list) {
        const known = Object.keys(FIELDS).filter(k => hasValue(a.values[k]));
        const unknown = Object.keys(a.values).filter(k => !FIELDS[k] && hasValue(a.values[k]));
        for (const k of [...known, ...unknown]) {
          const f = FIELDS[k], v = a.values[k];
          rows.push([...base, a.id, a.date, iso(a.createdAt),
            f ? f.d.label : '', f ? f.s.label : '', f ? f.i.label : '', f && f.side ? SIDE_JA[f.side] : '',
            f ? fmtValue({ ...f.i, unit: '' }, v) : String(v), f ? (f.i.unit || '') : '', k, JSON.stringify(v)]);
        }
        // 合計・小計（全項目そろっているときだけ。読み込み時は無視される集計行）
        for (const d of DOMAINS) for (const s of d.sections) {
          const sc = scoreOf(a, d, s);
          if (!sc || !sc.complete) continue;
          const line = (label, x, key) => rows.push([...base, a.id, a.date, iso(a.createdAt),
            d.label, s.label, label, '', x.sum, '点', `${d.id}.${s.id}.${key}`, x.sum]);
          line('合計', sc, '_total');
          sc.groups.filter(g => g.label).forEach((g, n) => line(`小計 ${g.label}`, g, `_sub${n + 1}`));
        }
      }
    }
    return rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  }

  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const rows = [];
    let row = [], cell = '', q = false;
    for (let n = 0; n < text.length; n++) {
      const ch = text[n];
      if (q) {
        if (ch === '"') { if (text[n + 1] === '"') { cell += '"'; n++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[n + 1] === '\n') n++;
        row.push(cell); cell = '';
        rows.push(row); row = [];
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => x !== ''));
  }

  function normDate(s) {
    const m = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s || '');
    return m ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : today();
  }

  // CSV → {clients, assessments}。形式が違えば例外
  function readBackup(text) {
    const rows = parseCSV(text);
    if (!rows.length) throw new Error('empty');
    const col = {};
    rows[0].forEach((name, n) => { col[name.trim()] = n; });
    for (const need of ['client_id', '名前', 'assessment_id', 'key', 'raw']) {
      if (col[need] == null) throw new Error('format');
    }
    const get = (r, name) => (col[name] != null && r[col[name]] != null ? r[col[name]] : '');
    const clients = new Map(), assessments = new Map();
    for (const r of rows.slice(1)) {
      const cid = get(r, 'client_id').trim();
      if (!cid) continue;
      if (!clients.has(cid)) {
        const age = get(r, '年齢').trim();
        clients.set(cid, {
          id: cid, name: get(r, '名前'), age: age === '' || isNaN(+age) ? '' : +age, goal: get(r, '目的'),
          createdAt: Date.parse(get(r, '登録日時')) || Date.now()
        });
      }
      const aid = get(r, 'assessment_id').trim(), key = get(r, 'key').trim();
      if (!aid || !key || /\._(total|sub\d+)$/.test(key)) continue;
      if (!assessments.has(aid)) {
        const date = normDate(get(r, '評価日'));
        assessments.set(aid, {
          id: aid, clientId: cid, date,
          createdAt: Date.parse(get(r, '記録日時')) || Date.parse(date) || Date.now(),
          updatedAt: Date.now(), values: {}
        });
      }
      let v;
      const raw = get(r, 'raw');
      if (/^true$/i.test(raw.trim())) v = true; // Excelで保存し直すと TRUE になる
      else { try { v = JSON.parse(raw); } catch (e) { v = get(r, '値'); } }
      if (hasValue(v)) assessments.get(aid).values[key] = v;
    }
    return { clients: [...clients.values()], assessments: [...assessments.values()] };
  }

  async function fileText(file) {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('shift_jis').decode(buf); } // Excelで保存し直した場合
  }

  // スマホは共有シート（ファイルに保存・AirDrop・メール等）、PCはダウンロード
  async function deliverFile(name, text) {
    const blob = new Blob(['﻿' + text], { type: 'text/csv' });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare) {
      const file = new File([blob], name, { type: 'text/csv' });
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: name }); return true; }
        catch (e) { if (e.name === 'AbortError') return false; }
      }
    }
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* 下の方法で再試行 */ }
    const t = h('textarea', { class: 'offscreen', readonly: true });
    t.value = text;
    document.body.append(t);
    t.select();
    t.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    t.remove();
    return ok;
  }

  // ---------------------------------------------------------------- 画面の枠・ルーター
  let leave = null; // 画面を離れるときの後始末
  const compareSel = {}; // assessmentId -> 比較対象のid（'' は比較なし）

  function go(path) {
    const target = '#/' + path;
    if (location.hash === target) route(); else location.hash = target;
  }

  function shell({ title, back, action, body, bar }) {
    const ghost = () => h('span', { class: 'icon-btn ghost' });
    const parts = [
      h('header', { class: 'top' },
        back != null ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': '戻る', onclick: () => go(back) }, '‹') : ghost(),
        h('h1', null, title),
        action || ghost()),
      h('main', { class: bar ? 'has-bar' : '' }, body)
    ];
    if (bar) parts.push(h('footer', { class: 'bar' }, bar));
    $app.replaceChildren(...parts);
    window.scrollTo(0, 0);
  }

  async function route() {
    if (leave) { const f = leave; leave = null; await f(); }
    const [name, id] = location.hash.replace(/^#\/?/, '').split('/');
    switch (name) {
      case 'client': return viewClient(id);
      case 'client-edit': return viewClientForm(id);
      case 'assess': return viewAssess(id);
      case 'result': return viewResult(id);
      case 'output': return viewOutput(id);
      case 'settings': return viewSettings();
      default: return viewHome();
    }
  }

  // ---------------------------------------------------------------- 1. クライアント一覧
  function viewHome() {
    let q = '';
    const list = h('div', { class: 'list' });
    const paint = () => {
      const items = S.clients.map(c => {
        const as = assessmentsOf(c.id);
        return { c, n: as.length, last: as.length ? as[as.length - 1].date : '' };
      }).filter(x => !q || x.c.name.toLowerCase().includes(q) || (x.c.goal || '').toLowerCase().includes(q))
        .sort((x, y) => (y.last || '').localeCompare(x.last || '') || x.c.name.localeCompare(y.c.name, 'ja'));
      if (!items.length) {
        list.replaceChildren(h('p', { class: 'empty' },
          S.clients.length ? '該当するクライアントがいません' : '「＋ 新規登録」からクライアントを登録してください'));
        return;
      }
      list.replaceChildren(...items.map(x => h('button', { class: 'row', type: 'button', onclick: () => go('client/' + x.c.id) },
        h('span', { class: 'row-main' },
          h('span', { class: 'row-title' }, x.c.name, hasValue(x.c.age) ? h('small', null, ` ${x.c.age}歳`) : null),
          x.c.goal ? h('span', { class: 'row-sub' }, x.c.goal) : null),
        h('span', { class: 'row-side' }, x.last ? [fmtShort(x.last), h('small', null, `${x.n}回`)] : h('small', null, '未評価')))));
    };
    paint();

    shell({
      title: 'クライアント',
      action: h('button', { class: 'icon-btn', type: 'button', 'aria-label': '設定', onclick: () => go('settings') }, '⚙'),
      body: [
        backupDue() ? h('button', { class: 'banner', type: 'button', onclick: () => go('settings') },
          'バックアップしていない記録があります。タップしてCSVを書き出す ›') : null,
        h('input', {
          class: 'search', type: 'search', placeholder: '名前・目的で検索', 'aria-label': '検索',
          oninput: e => { q = e.target.value.trim().toLowerCase(); paint(); }
        }),
        list
      ],
      bar: h('button', { class: 'btn primary', type: 'button', onclick: () => go('client-edit/new') }, '＋ 新規登録')
    });
  }

  // ---------------------------------------------------------------- クライアント登録・編集
  function viewClientForm(id) {
    const existing = id !== 'new' ? clientById(id) : null;
    if (id !== 'new' && !existing) return go('');
    const name = h('input', { type: 'text', value: existing ? existing.name : '', placeholder: '例：山田さん', autocomplete: 'off', maxlength: 40 });
    const age = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 120, value: existing && hasValue(existing.age) ? existing.age : '', placeholder: '例：45' });
    const goal = h('textarea', { rows: 2, placeholder: '例：姿勢改善、腰痛' });
    goal.value = existing ? existing.goal || '' : '';
    const presets = h('div', { class: 'chips' }, GOAL_PRESETS.map(g => h('button', {
      class: 'chip small', type: 'button', onclick: () => {
        const cur = goal.value.trim();
        if (!cur.split(/[、,]/).map(x => x.trim()).includes(g)) goal.value = cur ? `${cur}、${g}` : g;
      }
    }, g)));

    const save = async () => {
      const n = name.value.trim();
      if (!n) { toast('名前またはニックネームを入力してください'); name.focus(); return; }
      const a = age.value.trim();
      const c = existing || { id: uid('c'), createdAt: Date.now() };
      c.name = n;
      c.age = a === '' || isNaN(+a) ? '' : +a;
      c.goal = goal.value.trim();
      await saveClient(c);
      go('client/' + c.id);
    };

    shell({
      title: existing ? 'クライアント編集' : '新規登録',
      back: existing ? 'client/' + existing.id : '',
      body: h('div', { class: 'card form' },
        h('label', null, '名前またはニックネーム', name),
        h('label', null, '年齢', age),
        h('label', null, '目的', goal),
        presets),
      bar: h('button', { class: 'btn primary', type: 'button', onclick: save }, '保存')
    });
  }

  // ---------------------------------------------------------------- 2. クライアント詳細
  function viewClient(id) {
    const c = clientById(id);
    if (!c) return go('');
    const list = assessmentsOf(c.id).reverse();

    const summary = a => {
      const n = new Set(Object.keys(a.values).filter(k => hasValue(a.values[k]) && FIELDS[k] && !k.endsWith('._note') && !k.startsWith('_general'))
        .map(k => k.replace(/\.[RL]$/, ''))).size;
      const nrs = a.values['posture.pain.nrs'];
      return `${n}項目` + (hasValue(nrs) ? `・NRS ${nrs}` : '');
    };

    const start = () => {
      const a = { id: uid('a'), clientId: c.id, date: today(), createdAt: Date.now(), values: {} };
      S.assessments.push(a);
      go('assess/' + a.id);
    };

    const del = async () => {
      if (!confirm(`${c.name} と、評価記録 ${list.length}件をすべて削除します。元に戻せません。よろしいですか？`)) return;
      await removeClient(c);
      toast('削除しました');
      go('');
    };

    shell({
      title: c.name,
      back: '',
      action: h('button', { class: 'icon-btn text', type: 'button', onclick: () => go('client-edit/' + c.id) }, '編集'),
      body: [
        h('div', { class: 'card' },
          h('dl', { class: 'info' },
            h('dt', null, '年齢'), h('dd', null, hasValue(c.age) ? `${c.age}歳` : '—'),
            h('dt', null, '目的'), h('dd', null, c.goal || '—'))),
        h('h2', null, '評価の履歴'),
        list.length
          ? h('div', { class: 'list' }, list.map((a, n) => h('button', { class: 'row', type: 'button', onclick: () => go('result/' + a.id) },
            h('span', { class: 'row-main' },
              h('span', { class: 'row-title' }, fmtDate(a.date), n === 0 ? h('small', { class: 'tag' }, '最新') : null),
              h('span', { class: 'row-sub' }, summary(a))),
            h('span', { class: 'row-side' }, '›'))))
          : h('p', { class: 'empty' }, 'まだ評価がありません'),
        h('button', { class: 'link danger', type: 'button', onclick: del }, 'このクライアントを削除')
      ],
      bar: h('button', { class: 'btn primary', type: 'button', onclick: start }, '新しい評価を始める')
    });
  }

  // ---------------------------------------------------------------- 3. 評価入力
  function viewAssess(id) {
    const a = assessById(id);
    if (!a) return go('');
    const c = clientById(a.clientId);
    const prev = prevOf(a);
    const P = key => (prev ? prev.values[key] : undefined);

    // 入力のたびに自動保存（空の評価は保存しない）
    let timer = null, dirty = false;
    const refreshers = [];
    const painters = []; // 値をまとめて書き換えたときにチップの表示を合わせる
    const save = async () => {
      clearTimeout(timer);
      if (!dirty) return;
      dirty = false;
      if (hasAny(a)) await persistAssessment(a);
      else if (a.updatedAt) { await DB.del('assessments', a.id); delete a.updatedAt; await touch(); }
    };
    const changed = () => { dirty = true; clearTimeout(timer); timer = setTimeout(save, 400); };
    const setVal = (key, v) => {
      if (hasValue(v)) a.values[key] = v; else delete a.values[key];
      changed();
      refreshers.forEach(f => f());
    };
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onHide);
    leave = async () => {
      document.removeEventListener('visibilitychange', onHide);
      await save();
      if (!hasAny(a)) S.assessments = S.assessments.filter(x => x !== a);
    };

    // --- 入力部品
    function chipGroup(options, key, { multi, cls } = {}) {
      const pv = P(key);
      const wasOn = v => (Array.isArray(pv) ? pv.includes(v) : pv === v);
      const isOn = v => { const cur = a.values[key]; return Array.isArray(cur) ? cur.includes(v) : cur === v; };
      const btns = options.map(o => h('button', {
        class: 'chip' + (hasValue(pv) && wasOn(o.v) ? ' was' : ''), type: 'button',
        onclick: () => {
          if (multi) {
            const cur = Array.isArray(a.values[key]) ? a.values[key] : [];
            const next = cur.includes(o.v) ? cur.filter(x => x !== o.v) : options.map(x => x.v).filter(x => x === o.v || cur.includes(x));
            setVal(key, next);
          } else setVal(key, isOn(o.v) ? undefined : o.v);
          paint();
        }
      }, o.label));
      const paint = () => btns.forEach((b, n) => {
        const on = isOn(options[n].v);
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on);
      });
      paint();
      painters.push(paint);
      return h('div', { class: 'chips ' + (cls || '') }, btns);
    }

    function stepper(i, key) {
      const pv = P(key);
      const inp = h('input', { class: 'num', type: 'number', inputmode: 'decimal', step: 'any', placeholder: '–', 'aria-label': i.label });
      if (hasValue(a.values[key])) inp.value = a.values[key];
      const clamp = n => Math.min(i.max != null ? i.max : Infinity, Math.max(i.min != null ? i.min : -Infinity, n));
      inp.addEventListener('input', () => {
        const t = inp.value.trim();
        if (t === '') return setVal(key, undefined);
        const n = Number(t);
        if (!isNaN(n)) setVal(key, n);
      });
      const bump = dir => {
        // 未入力なら前回値（なければ基準値）から始める
        const n = inp.value === '' ? (hasValue(pv) ? pv : (i.init != null ? i.init : 0)) : round1(Number(inp.value) + dir * (i.step || 1));
        inp.value = clamp(n);
        setVal(key, clamp(n));
      };
      const el = h('div', { class: 'stepper-wrap' },
        h('div', { class: 'stepper' },
          h('button', { type: 'button', 'aria-label': '減らす', onclick: () => bump(-1) }, '−'),
          inp,
          h('button', { type: 'button', 'aria-label': '増やす', onclick: () => bump(1) }, '＋')));
      if (hasValue(pv)) {
        el.append(h('button', {
          class: 'prev-hint', type: 'button', title: '前回と同じ値を入れる',
          onclick: () => { inp.value = pv; setVal(key, pv); }
        }, `前回 ${pv}`));
      }
      return el;
    }

    function control(i, key) {
      switch (i.type) {
        case 'choice': return chipGroup(i.options, key);
        case 'multi': return chipGroup(i.options, key, { multi: true });
        case 'scale': {
          const o = [];
          for (let n = i.min; n <= i.max; n++) o.push({ v: n, label: String(n) });
          return chipGroup(o, key, { cls: 'scale' });
        }
        case 'number': return stepper(i, key);
        default: return null;
      }
    }

    function renderItem(d, s, i, onClear) {
      const fields = fieldsOf(d, s, i);
      if (i.type === 'check' && !i.bilateral) {
        return h('span', { class: 'item-check' }, chipGroup([{ v: true, label: i.label }], fields[0].key));
      }
      const head = h('div', { class: 'item-head' },
        h('span', { class: 'item-label' }, i.label, i.unit ? h('small', null, `（${i.unit}）`) : null),
        i.hint ? h('small', { class: 'hint' }, i.hint) : null,
        onClear ? h('button', { class: 'clear', type: 'button', 'aria-label': `${i.label}を消す`, onclick: onClear }, '×') : null);
      let body;
      if (i.type === 'check') {
        body = h('div', { class: 'chips' }, fields.map(f => chipGroup([{ v: true, label: SIDE_JA[f.side] }], f.key).firstChild));
      } else if (!i.bilateral) {
        body = control(i, fields[0].key);
      } else {
        body = h('div', { class: 'bi ' + (i.type === 'number' ? 'cols' : 'rows') },
          fields.map(f => h('div', { class: 'bi-side' }, h('span', { class: 'side-tag' }, SIDE_JA[f.side]), control(i, f.key))));
      }
      return h('div', { class: 'item' }, head, body);
    }

    function noteBox(key, placeholder) {
      const t = h('textarea', { class: 'note', rows: 2, placeholder });
      t.value = a.values[key] || '';
      t.addEventListener('input', () => { setVal(key, t.value.trim() ? t.value : undefined); fit(t); });
      return t;
    }

    function renderSection(d, s, open) {
      const badge = h('span', { class: 'badge' });
      const count = () => s.items.filter(i => fieldsOf(d, s, i).some(f => hasValue(a.values[f.key]))).length
        + (hasValue(a.values[noteKey(d, s)]) ? 1 : 0);
      refreshers.push(() => { const n = count(); badge.textContent = n || ''; badge.hidden = !n; });
      const body = h('div', { class: 'sec-body' });

      if (s.optional) {
        // 測った項目だけ追加する。前回測った項目は最初から開く
        const picker = h('div', { class: 'picker' });
        const rows = h('div', { class: 'opt-rows' });
        let group = null, line = null;
        for (const i of s.items) {
          const fields = fieldsOf(d, s, i);
          const filled = () => fields.some(f => hasValue(a.values[f.key]));
          let row = null;
          const chip = h('button', { class: 'chip small', type: 'button' }, i.chip || i.label);
          const holder = h('div', { hidden: true });
          const build = () => {
            row = renderItem(d, s, i, () => {
              fields.forEach(f => { delete a.values[f.key]; });
              setVal(fields[0].key, undefined);
              show(false);
            });
            holder.replaceChildren(row);
          };
          const show = on => {
            if (on && !row) build();
            if (!on) row = null;
            holder.hidden = !on;
            chip.classList.toggle('on', on);
            chip.setAttribute('aria-pressed', on);
          };
          chip.addEventListener('click', () => {
            if (holder.hidden) { show(true); holder.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
            else if (filled()) holder.scrollIntoView({ block: 'center', behavior: 'smooth' });
            else show(false);
          });
          if (filled() || fields.some(f => hasValue(P(f.key)))) show(true);
          if (i.group !== group) {
            group = i.group;
            line = h('div', { class: 'chips' });
            picker.append(h('div', { class: 'picker-line' }, h('span', { class: 'picker-group' }, group || ''), line));
          }
          line.append(chip);
          rows.append(holder);
        }
        body.append(h('p', { class: 'hint' }, '測る項目をタップして追加'), picker, rows);
      } else {
        if (s.score) {
          const total = h('strong');
          refreshers.push(() => {
            const sc = scoreOf(a, d, s);
            total.textContent = sc ? `合計 ${sc.sum}/${sc.max}点（${sc.n}/${sc.N}項目）` : '合計 —';
          });
          const fill = () => {
            for (const i of s.items) {
              if (i.type !== 'scale') continue;
              for (const f of fieldsOf(d, s, i)) if (!hasValue(a.values[f.key])) a.values[f.key] = i.max;
            }
            changed();
            refreshers.forEach(f => f());
            painters.forEach(f => f());
          };
          body.append(h('div', { class: 'score-line' }, total,
            h('button', { class: 'chip small', type: 'button', onclick: fill }, '未入力を満点で埋める')));
          if (s.score.hint) body.append(h('p', { class: 'hint' }, s.score.hint));
        }
        let group = null;
        for (const i of s.items) {
          if (i.group && i.group !== group) { group = i.group; body.append(h('h4', { class: 'grp' }, group)); }
          body.append(renderItem(d, s, i));
        }
      }
      body.append(noteBox(noteKey(d, s), 'メモ（自由記載）'));

      return h('details', { class: 'sec', open }, h('summary', null, h('span', { class: 'sec-title' }, s.label), badge), body);
    }

    // --- 画面
    const dateInp = h('input', { type: 'date', value: a.date, 'aria-label': '評価日' });
    dateInp.addEventListener('change', () => { if (dateInp.value) { a.date = dateInp.value; changed(); } });

    let domain = DOMAINS[0];
    const secWrap = h('div');
    const paintDomain = () => {
      refreshers.length = 0;
      painters.length = 0;
      secWrap.replaceChildren(...domain.sections.map((s, n) => renderSection(domain, s, n === 0)));
      refreshers.forEach(f => f());
    };
    const tabs = DOMAINS.length > 1 ? h('div', { class: 'tabs' }, DOMAINS.map(d => {
      const b = h('button', { type: 'button', class: d === domain ? 'on' : '' }, d.label);
      b.addEventListener('click', () => {
        domain = d;
        [...b.parentNode.children].forEach(x => x.classList.toggle('on', x === b));
        paintDomain();
      });
      return b;
    })) : null;
    paintDomain();

    shell({
      title: c.name,
      back: 'client/' + c.id,
      body: [
        h('div', { class: 'card meta-row' },
          h('label', { class: 'inline' }, '評価日', dateInp),
          h('span', { class: 'sub' }, prev ? `前回 ${fmtDate(prev.date)}` : '初回評価')),
        tabs,
        secWrap,
        h('details', { class: 'sec' }, h('summary', null, h('span', { class: 'sec-title' }, '総合所見・ひとこと')),
          h('div', { class: 'sec-body' },
            h('div', { class: 'item-label' }, '総合所見（記録用）'),
            noteBox(G_NOTE, '全体の所見・方針など'),
            h('div', { class: 'item-label' }, 'クライアントへのひとこと'),
            noteBox(G_CLIENT, 'クライアント向け文章の最後に入ります')))
      ],
      bar: h('button', {
        class: 'btn primary', type: 'button', onclick: async () => {
          await save();
          if (!hasAny(a)) return toast('まだ入力がありません');
          go('result/' + a.id);
        }
      }, '結果を見る')
    });
  }

  // ---------------------------------------------------------------- 4. 結果・比較
  function compareTarget(a) {
    const sel = compareSel[a.id];
    if (sel === '') return null;
    return (sel && assessById(sel)) || prevOf(a);
  }

  function viewResult(id) {
    const a = assessById(id);
    if (!a) return go('');
    const c = clientById(a.clientId);
    const others = assessmentsOf(c.id).filter(x => x !== a).reverse();
    const body = h('div');

    const paint = () => {
      const p = compareTarget(a);
      const tally = { better: 0, worse: 0, same: 0 };
      const secs = [];
      for (const d of DOMAINS) for (const s of d.sections) {
        const pObs = sectionObserved(p, d, s), cObs = sectionObserved(a, d, s);
        const rows = [];
        if (s.score) {
          const cs = scoreOf(a, d, s), ps = scoreOf(p, d, s);
          const line = (label, c, pv) => {
            if (!c && !pv) return;
            let st = null;
            if (c && pv && c.n === c.N && pv.n === pv.N) {
              const dl = c.sum - pv.sum;
              st = h('span', { class: 'st ' + (dl > 0 ? 'better' : dl < 0 ? 'worse' : 'same') },
                dl ? `${dl > 0 ? '改善' : '低下'} ${signed(dl)}` : '変化なし');
            }
            rows.push(h('div', { class: 'cmp-row total' },
              h('span', { class: 'cmp-label' }, label),
              h('span', { class: 'cmp-val' },
                p ? [h('span', { class: 'old' }, pv ? scoreText(pv) : '—'), h('span', { class: 'arrow' }, '→')] : null,
                h('strong', null, c ? scoreText(c) : '—')),
              st));
          };
          line('合計', cs, ps);
          const labels = [...new Set([...(cs ? cs.groups : []), ...(ps ? ps.groups : [])].map(g => g.label).filter(Boolean))];
          labels.forEach(l => line(l, scoreGroup(cs, l), scoreGroup(ps, l)));
        }
        for (const i of s.items) for (const f of fieldsOf(d, s, i)) {
          const cv = a.values[f.key], pv = p ? p.values[f.key] : undefined;
          // 点数セクションは、満点の項目を省いて減点のある項目だけ並べる
          const lost = v => hasValue(v) && v < i.max;
          if (s.score && i.type === 'scale' && !lost(cv) && !lost(pv)) continue;
          const r = compare(i, pv, cv, pObs, cObs);
          if (!r) continue;
          if (p && tally[r.st] != null) tally[r.st]++;
          const label = i.label + (f.side ? ` ${SIDE_JA[f.side]}` : '');
          const cur = hasValue(cv) ? fmtValue(i, cv) : '—';
          rows.push(h('div', { class: 'cmp-row' },
            h('span', { class: 'cmp-label' }, label),
            h('span', { class: 'cmp-val' },
              p ? [h('span', { class: 'old' }, hasValue(pv) ? fmtValue(i, pv) : '—'), h('span', { class: 'arrow' }, '→')] : null,
              h('strong', null, cur)),
            p && r.st ? h('span', { class: 'st ' + r.st }, (r.label || ST_LABEL[r.st]) + (r.delta && r.st !== 'same' ? ` ${r.delta}` : '')) : null));
        }
        const note = a.values[noteKey(d, s)];
        if (!rows.length && !hasValue(note)) continue;
        secs.push(h('section', { class: 'card' }, h('h3', null, s.label), rows,
          hasValue(note) ? h('p', { class: 'note-view' }, note) : null));
      }
      for (const [key, title] of [[G_NOTE, '総合所見'], [G_CLIENT, 'クライアントへのひとこと']]) {
        if (hasValue(a.values[key])) secs.push(h('section', { class: 'card' }, h('h3', null, title), h('p', { class: 'note-view' }, a.values[key])));
      }
      if (p) {
        secs.unshift(h('div', { class: 'tally' },
          h('span', { class: 'st better' }, `改善 ${tally.better}`),
          h('span', { class: 'st worse' }, `低下 ${tally.worse}`),
          h('span', { class: 'st same' }, `変化なし ${tally.same}`)));
      }
      body.replaceChildren(...secs);
    };

    let picker = null;
    if (others.length) {
      const sel = h('select', {
        'aria-label': '比較する評価',
        onchange: () => { compareSel[a.id] = sel.value; paint(); }
      }, others.map(x => h('option', { value: x.id }, fmtDate(x.date))), h('option', { value: '' }, '比較しない'));
      const p = compareTarget(a);
      sel.value = p ? p.id : '';
      picker = h('label', { class: 'inline' }, '比較', sel);
    }
    paint();

    const del = async () => {
      if (!confirm(`${fmtDate(a.date)} の評価を削除します。元に戻せません。よろしいですか？`)) return;
      await removeAssessment(a);
      toast('削除しました');
      go('client/' + c.id);
    };

    shell({
      title: `${c.name}　${fmtShort(a.date)}`,
      back: 'client/' + c.id,
      action: h('button', { class: 'icon-btn text', type: 'button', onclick: () => go('assess/' + a.id) }, '編集'),
      body: [
        h('div', { class: 'card meta-row' },
          h('span', null, `評価日 ${fmtDate(a.date)}`),
          picker || h('span', { class: 'sub' }, '初回評価')),
        body,
        h('button', { class: 'link danger', type: 'button', onclick: del }, 'この評価を削除')
      ],
      bar: h('button', { class: 'btn primary', type: 'button', onclick: () => go('output/' + a.id) }, '文章を作る')
    });
  }

  // ---------------------------------------------------------------- 5. 出力
  function viewOutput(id) {
    const a = assessById(id);
    if (!a) return go('');
    const c = clientById(a.clientId);
    const prev = compareTarget(a);
    let tab = 'record', withDiff = !!prev, showAll = false;

    const findings = collectFindings(a);
    const cands = exerciseCandidates(findings);
    let exSel = Array.isArray(a.exSel) ? a.exSel.filter(x => EX[x]) : cands.slice(0, DEFAULT_EX_COUNT);

    const area = h('textarea', { class: 'out', 'aria-label': '出力文' });
    area.addEventListener('input', () => fit(area));
    const opts = h('div', { class: 'out-opts' });

    const orderedSel = () => [...cands.filter(x => exSel.includes(x)), ...exSel.filter(x => !cands.includes(x))];
    const regen = () => {
      area.value = tab === 'record' ? buildRecord(a, prev, withDiff) : buildClientText(a, prev, orderedSel());
      fit(area);
    };

    const paintOpts = () => {
      if (tab === 'record') {
        const cb = h('input', { type: 'checkbox' });
        cb.checked = withDiff;
        cb.addEventListener('change', () => { withDiff = cb.checked; regen(); });
        opts.replaceChildren(prev ? h('label', { class: 'check' }, cb, `前回（${fmtShort(prev.date)}）比を付ける`) : '');
        return;
      }
      const ids = showAll ? [...cands, ...Object.keys(EX).filter(x => !cands.includes(x))] : [...cands, ...exSel.filter(x => !cands.includes(x))];
      opts.replaceChildren(
        h('div', { class: 'item-label' }, 'おすすめ運動（タップで入れ替え）'),
        h('div', { class: 'chips' },
          ids.map(x => h('button', {
            class: 'chip small' + (exSel.includes(x) ? ' on' : ''), type: 'button',
            onclick: async () => {
              exSel = exSel.includes(x) ? exSel.filter(y => y !== x) : [...exSel, x];
              a.exSel = exSel;
              await persistAssessment(a);
              paintOpts();
              regen();
            }
          }, EX[x].name)),
          h('button', { class: 'chip small ghost', type: 'button', onclick: () => { showAll = !showAll; paintOpts(); } },
            showAll ? '候補だけ表示' : 'ほかの運動…')),
        h('p', { class: 'hint' }, '運動を入れ替えると、下の文章は作り直されます（手直しは入れ替えの後に）。'));
    };

    const tabBtns = [['record', '記録用'], ['client', 'クライアント用']].map(([k, label]) => h('button', {
      type: 'button', class: k === tab ? 'on' : '',
      onclick: e => {
        tab = k;
        [...e.target.parentNode.children].forEach(x => x.classList.toggle('on', x === e.target));
        paintOpts();
        regen();
      }
    }, label));

    const copy = async () => toast(await copyText(area.value) ? 'コピーしました' : 'コピーできませんでした。長押しで選択してください');
    const share = async () => { try { await navigator.share({ text: area.value }); } catch (e) { /* キャンセル */ } };

    shell({
      title: `${c.name}　${fmtShort(a.date)}`,
      back: 'result/' + a.id,
      body: [h('div', { class: 'tabs' }, tabBtns), opts, area,
        h('p', { class: 'hint' }, '文章はこの場で手直しできます（手直しした内容は保存されません）。')],
      bar: [
        navigator.share ? h('button', { class: 'btn', type: 'button', onclick: share }, '共有') : null,
        h('button', { class: 'btn primary', type: 'button', onclick: copy }, 'コピー')
      ]
    });
    paintOpts();
    regen();
  }

  // ---------------------------------------------------------------- 設定・バックアップ
  function viewSettings() {
    const status = h('p', { class: 'sub' });
    const paintStatus = () => {
      const lb = S.meta.lastBackup;
      status.textContent = lb
        ? `最終バックアップ：${fmtDateTime(lb)}（${Math.floor((Date.now() - lb) / DAY)}日前）` + (S.meta.lastChange > lb ? '・その後に変更あり' : '')
        : '最終バックアップ：まだありません';
    };
    paintStatus();

    const doExport = async () => {
      if (!S.clients.length) return toast('書き出すデータがありません');
      const d = new Date();
      const name = `pt-assessment_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.csv`;
      if (await deliverFile(name, buildCSV())) {
        await setMeta('lastBackup', Date.now());
        paintStatus();
        toast('CSVを書き出しました');
      }
    };

    const file = h('input', { type: 'file', accept: '.csv,text/csv', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      let data;
      try { data = readBackup(await fileText(f)); }
      catch (e) { return alert('このファイルは読み込めません。このアプリで書き出したCSVを選んでください。'); }
      const dupC = data.clients.filter(x => clientById(x.id)).length;
      const dupA = data.assessments.filter(x => assessById(x.id)).length;
      if (!confirm(`クライアント ${data.clients.length}名・評価 ${data.assessments.length}件を読み込みます。\n`
        + `このうち、端末内にすでにあるクライアント ${dupC}名・評価 ${dupA}件は、CSVの内容で上書きされます。\nよろしいですか？`)) return;
      for (const x of data.clients) await DB.put('clients', x);
      for (const x of data.assessments) await DB.put('assessments', x);
      await loadAll();
      await touch();
      toast('読み込みました');
      viewSettings();
    });

    const persistInfo = h('p', { class: 'sub' });
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(ok => {
        persistInfo.textContent = ok ? '保存領域：保護されています（自動削除の対象外）' : '保存領域：ブラウザの判断で消える可能性があります。ホーム画面に追加して使ってください。';
      });
    }

    shell({
      title: '設定・バックアップ',
      back: '',
      body: [
        h('div', { class: 'card' },
          h('h3', null, 'バックアップ'),
          status,
          h('p', { class: 'sub' }, `クライアント ${S.clients.length}名・評価 ${S.assessments.length}件`),
          h('button', { class: 'btn primary block', type: 'button', onclick: doExport }, 'CSVを書き出す'),
          h('button', { class: 'btn block', type: 'button', onclick: () => file.click() }, 'CSVを読み込む（復元）'),
          file,
          h('p', { class: 'hint' }, '書き出したCSVはExcelでそのまま開けます。機種変更やデータ消失のときは、同じCSVを読み込むと元に戻せます。')),
        h('div', { class: 'card' },
          h('h3', null, 'データの保存場所'),
          h('p', { class: 'sub' }, '記録はこの端末のブラウザ内にだけ保存され、外部には送信されません。'),
          persistInfo,
          h('p', { class: 'hint' }, 'iPhone：Safariの共有ボタン →「ホーム画面に追加」。Android：Chromeのメニュー →「ホーム画面に追加」。ブラウザの「履歴とWebサイトデータを消去」を行うと記録も消えるので、先にCSVを書き出してください。')),
        h('p', { class: 'ver' }, `PT評価記録 v${APP_VERSION}`)
      ]
    });
  }

  // ---------------------------------------------------------------- 起動
  async function boot() {
    try {
      await DB.open();
      await loadAll();
    } catch (e) {
      $app.replaceChildren(h('p', { class: 'boot' }, 'データ保存領域を開けませんでした。プライベートブラウズを解除して開き直してください。'));
      return;
    }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    window.addEventListener('hashchange', route);
    route();
  }
  boot();
})();
