/* Mononoke - DAST methodology support. Pure front-end, no backend, in-memory state. */
"use strict";
(function () {
const DATA = window.DATA;
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));

/* ------------------------------------------------------------------ utils */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ------------------------------------------------------- markdown rendering */
function inlineMd(s) {
  return s.split(/(`[^`]+`)/g).map(p => {
    if (p.length > 1 && p[0] === "`" && p[p.length - 1] === "`")
      return "<code>" + esc(p.slice(1, -1)) + "</code>";
    let t = esc(p);
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
      (m, txt, url) => '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + txt + "</a>");
    return t;
  }).join("");
}
function codeblock(code) {
  return '<div class="codeblock"><button class="copy" type="button">Copy</button><pre><code>'
    + esc(code) + "</code></pre></div>";
}
function parseList(lines, start) {
  let i = start; const items = [];
  while (i < lines.length) {
    const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
    if (m) { items.push({ indent: m[1].length, type: /\d+\./.test(m[2]) ? "ol" : "ul", text: m[3] }); i++; continue; }
    if (lines[i].trim() === "") {
      let k = i + 1; while (k < lines.length && lines[k].trim() === "") k++;
      if (k < lines.length && /^(\s*)([-*]|\d+\.)\s+/.test(lines[k])) { i = k; continue; }
    }
    break;
  }
  let html = ""; const stack = [];
  for (const it of items) {
    while (stack.length && it.indent < stack[stack.length - 1].indent) html += "</li></" + stack.pop().type + ">";
    if (!stack.length || it.indent > stack[stack.length - 1].indent) { stack.push({ type: it.type, indent: it.indent }); html += "<" + it.type + "><li>" + inlineMd(it.text); }
    else html += "</li><li>" + inlineMd(it.text);
  }
  while (stack.length) html += "</li></" + stack.pop().type + ">";
  return [html, i];
}
function mdToHtml(md) {
  if (!md) return "";
  const lines = md.split("\n"); let html = ""; let i = 0; let para = [];
  const flush = () => { if (para.length) { html += "<p>" + inlineMd(para.join(" ").trim()) + "</p>"; para = []; } };
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      flush(); const code = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) { code.push(lines[i]); i++; }
      i++; html += codeblock(code.join("\n")); continue;
    }
    const hm = /^(#{1,6})\s+(.*)$/.exec(line);
    if (hm) { flush(); const lv = Math.min(hm[1].length + 1, 6); html += "<h" + lv + ' class="md-h">' + inlineMd(hm[2].trim()) + "</h" + lv + ">"; i++; continue; }
    if (/^\s*---+\s*$/.test(line)) { flush(); html += "<hr>"; i++; continue; }
    if (/^\s*>\s?/.test(line)) { flush(); const q = []; while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, "")); i++; } html += "<blockquote>" + inlineMd(q.join(" ")) + "</blockquote>"; continue; }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) { flush(); const r = parseList(lines, i); html += r[0]; i = r[1]; continue; }
    if (line.trim() === "") { flush(); i++; continue; }
    para.push(line); i++;
  }
  flush(); return html;
}

/* ------------------------------------------------------------- data lookups */
const CATS = DATA.dast.categories;
const CAT_BY = {}; CATS.forEach(c => CAT_BY[c.slug] = c);
const FAM_BY = {}; DATA.dast.families.forEach(f => FAM_BY[f.key] = f.title);
function catsOfFamily(key) { return CATS.filter(c => c.family === key); }

/* --------------------------------------------------------------- signals UI */
const YN = [["", "Unknown"], ["yes", "Yes"], ["no", "No"]];
const SIGNAL_FIELDS = [
  { group: "Database", fields: [
    { k: "db", label: "Database", type: "select", opts: [["", "Unknown"], ["sql", "SQL"], ["nosql", "NoSQL"], ["both", "Both"], ["none", "None"]] },
  ]},
  { group: "Backend", fields: [
    { k: "backendLang", label: "Backend language", type: "multi", opts: [["php", "PHP"], ["java", "Java"], ["python", "Python"], ["nodejs", "Node.js"], ["ruby", "Ruby"], ["dotnet", ".NET"], ["other", "Other"]] },
    { k: "templating", label: "Server-side templating", type: "select", opts: [["", "Unknown"], ["present", "Present"], ["none", "None"]] },
    { k: "templateEngine", label: "Template engine", type: "text", ph: "Jinja2, Twig, Freemarker..." },
    { k: "serialization", label: "Native serialization", type: "yn" },
  ]},
  { group: "API", fields: [
    { k: "api", label: "Exposed API", type: "multi", opts: [["rest", "REST"], ["graphql", "GraphQL"], ["soap", "SOAP"], ["grpc", "gRPC"], ["none", "None"]] },
  ]},
  { group: "Auth and session", fields: [
    { k: "auth", label: "Authentication", type: "yn" },
    { k: "session", label: "Session mechanism", type: "multi", opts: [["cookie", "Cookie"], ["jwt", "JWT"], ["custom", "Custom token"], ["none", "None"]] },
    { k: "oauth", label: "OAuth / SSO", type: "yn" },
    { k: "ldap", label: "LDAP / directory", type: "yn" },
    { k: "twofa", label: "2FA present", type: "yn" },
    { k: "remember", label: "Stay-logged-in", type: "yn" },
  ]},
  { group: "Client", fields: [
    { k: "clientFramework", label: "Client framework", type: "multi", opts: [["angularjs", "AngularJS"], ["angular", "Angular"], ["react", "React"], ["vue", "Vue"], ["jquery", "jQuery"], ["none", "None"], ["other", "Other"]] },
    { k: "csp", label: "Content-Security-Policy", type: "yn" },
  ]},
  { group: "Infrastructure and surface", fields: [
    { k: "edgeCache", label: "Reverse proxy / cache / CDN", type: "yn" },
    { k: "waf", label: "WAF", type: "yn" },
    { k: "xml", label: "XML processing", type: "yn" },
    { k: "fileUpload", label: "File upload", type: "yn" },
    { k: "serverFetch", label: "Server-side fetch (SSRF surface)", type: "yn" },
    { k: "websocket", label: "WebSockets", type: "yn" },
    { k: "llm", label: "LLM feature", type: "yn" },
  ]},
];

/* ----------------------------------------------------------------- state */
function emptyState() {
  return {
    version: 1, app: "mononoke", created: Date.now(),
    recon: { notes: "" },
    stack: {
      signals: { db: "", backendLang: [], templating: "", templateEngine: "", api: [], session: [],
        clientFramework: [], auth: "", oauth: "", ldap: "", csp: "", edgeCache: "", waf: "",
        xml: "", fileUpload: "", serverFetch: "", serialization: "", websocket: "", llm: "", twofa: "", remember: "" },
      answers: {}, notes: "",
    },
    files: { notes: "" },
    pages: [],
    ui: { collapsed: {}, showNA: false, lastSel: "recon" },
  };
}
let STATE = emptyState();
let SEL = "recon";

function getPage(id) { return STATE.pages.find(p => p.id === id) || null; }
function getFunc(pid, fid) { const p = getPage(pid); return p ? (p.funcs.find(f => f.id === fid) || null) : null; }
function catRec(f, slug) { if (!f.cats) f.cats = {}; if (!f.cats[slug]) f.cats[slug] = { override: "auto", status: "todo", checks: {}, notes: "" }; return f.cats[slug]; }
function catRecRO(f, slug) { return (f.cats && f.cats[slug]) || {}; } /* read-only: never creates a record */

/* --------------------------------------------------------- relevance engine */
function categoryNA(cat) {
  const S = STATE.stack.signals;
  for (const r of (cat.na || [])) {
    const v = S[r.sig];
    if (r.op === "eq") { if (v === r.val) return r.reason; }
    else if (r.op === "in") { if (v && r.val.indexOf(v) >= 0) return r.reason; }
    else if (r.op === "contains") { if (Array.isArray(v) && v.indexOf(r.val) >= 0) return r.reason; }
    else if (r.op === "excludes") { if (Array.isArray(v) && v.length && v.indexOf(r.val) < 0) return r.reason; }
  }
  return null;
}
function catEffective(f, slug) {
  const cat = CAT_BY[slug]; const auto = categoryNA(cat);
  const rec = (f.cats && f.cats[slug]) || {};
  const ov = rec.override || "auto";
  let eff = "show", reason = null;
  if (ov === "na") { eff = "na"; reason = "Marked N/A"; }
  else if (ov === "relevant") { eff = "show"; }
  else if (auto) { eff = "na"; reason = auto; }
  return { eff, reason, auto, ov, status: rec.status || "todo", checks: rec.checks || {}, notes: rec.notes || "" };
}
function catProgress(rec, cat) {
  const total = cat.sections.length; let done = 0;
  for (let i = 0; i < total; i++) if (rec.checks && rec.checks[i]) done++;
  return { done, total };
}
function funcProgress(f) {
  let shown = 0, done = 0;
  for (const c of CATS) { const e = catEffective(f, c.slug); if (e.eff === "show") { shown++; if (e.status === "done") done++; } }
  return { done, shown };
}

/* --------------------------------------------------------------- selection */
function select(key) { SEL = key; STATE.ui.lastSel = key; renderTree(); renderContent(); const c = $("#content"); if (c) c.scrollTop = 0; }
function parseSel(key) {
  const p = key.split(":");
  if (p[0] === "ref") return { type: "ref", slug: p[1] };
  if (p[0] === "page") return { type: "page", pid: p[1] };
  if (p[0] === "func") return { type: "func", pid: p[1], fid: p[2] };
  if (p[0] === "fcat") return { type: "fcat", pid: p[1], fid: p[2], slug: p[3] };
  return { type: key };
}

/* -------------------------------------------------------------- tree render */
function collapsed(key, defClosed) { const v = STATE.ui.collapsed[key]; return v === undefined ? !!defClosed : v; }
function row(opts) {
  const cls = ["row", "lvl" + (opts.lvl || 0)];
  if (opts.sel && opts.sel === SEL) cls.push("active");
  if (opts.extra) cls.push(opts.extra);
  let tw = "";
  if (opts.caret !== undefined) tw = '<span class="tw" data-toggle="' + esc(opts.tkey) + '">' + (opts.caret ? "▾" : "▸") + "</span>";
  else tw = '<span class="tw"></span>';
  const sev = opts.sev ? '<span class="sev sev-' + opts.sev + '"></span>' : "";
  const dot = opts.dot ? '<span class="dot ' + opts.dot + '"></span>' : "";
  const count = opts.count ? '<span class="count">' + esc(opts.count) + "</span>" : "";
  const selAttr = opts.sel ? ' data-sel="' + esc(opts.sel) + '"' : "";
  return '<div class="' + cls.join(" ") + '"' + selAttr + ">" + tw + sev + '<span class="lbl">' + esc(opts.label) + "</span>" + dot + count + "</div>";
}
function renderTree() {
  const t = $("#tree"); if (!t) return;
  let h = "";
  /* recon & setup */
  h += '<div class="tree-group-title">Recon and setup</div>';
  h += row({ label: "Recon (entry point)", sel: "recon", lvl: 0 });
  h += row({ label: "Stack recon", sel: "stack", lvl: 0 });
  h += row({ label: "File discovery", sel: "files", lvl: 0 });

  /* reference */
  h += '<div class="tree-group-title">Reference</div>';
  h += row({ label: "DAST overview", sel: "dast-intro", lvl: 0 });
  for (const fam of DATA.dast.families) {
    const fk = "fam:" + fam.key; const cl = collapsed(fk, true);
    h += row({ label: fam.title, lvl: 0, caret: !cl, tkey: fk });
    h += '<div class="children' + (cl ? " collapsed" : "") + '">';
    for (const c of catsOfFamily(fam.key)) {
      const na = categoryNA(c);
      h += row({ label: c.name, sel: "ref:" + c.slug, lvl: 1, sev: c.severity, extra: na ? "dim" : "" });
    }
    h += "</div>";
  }

  /* assessment */
  h += '<div class="tree-group-title">Assessment</div>';
  h += '<div class="row lvl0" data-act="toggle-na"><span class="tw">' + (STATE.ui.showNA ? "■" : "□") + '</span><span class="lbl" style="color:var(--muted)">Show N/A categories</span></div>';
  for (const page of STATE.pages) {
    const pk = "page:" + page.id; const pcl = collapsed(pk, false);
    h += row({ label: page.name || "(page)", sel: pk, lvl: 0, caret: !pcl, tkey: pk });
    h += '<div class="children' + (pcl ? " collapsed" : "") + '">';
    for (const f of page.funcs) {
      const fkk = "func:" + page.id + ":" + f.id; const fcl = collapsed(fkk, false);
      const prog = funcProgress(f);
      h += row({ label: f.name || "(functionality)", sel: fkk, lvl: 1, caret: !fcl, tkey: fkk, count: prog.shown ? prog.done + "/" + prog.shown : "" });
      h += '<div class="children' + (fcl ? " collapsed" : "") + '">';
      for (const c of CATS) {
        const e = catEffective(f, c.slug);
        if (e.eff === "na" && !STATE.ui.showNA) continue;
        const rec = catRecRO(f, c.slug); const p = catProgress(rec, c);
        h += row({
          label: c.name, sel: "fcat:" + page.id + ":" + f.id + ":" + c.slug, lvl: 2, sev: c.severity,
          extra: e.eff === "na" ? "na" : (e.status === "done" ? "done" : ""),
          dot: e.eff === "na" ? "" : e.status,
          count: (e.eff === "show" && p.total) ? p.done + "/" + p.total : "",
        });
      }
      h += "</div>";
    }
    h += '<div class="add-row lvl1" data-act="add-func" data-pid="' + esc(page.id) + '">+ Add functionality</div>';
    h += "</div>";
  }
  h += '<div class="add-row lvl0" data-act="add-page">+ Add page</div>';
  t.innerHTML = h;
}

/* ----------------------------------------------------------- content render */
function ynSelect(k, val) {
  return '<select data-sig="' + k + '">' + YN.map(o => '<option value="' + o[0] + '"' + (o[0] === (val || "") ? " selected" : "") + ">" + esc(o[1]) + "</option>").join("") + "</select>";
}
function sigControl(fld) {
  const v = STATE.stack.signals[fld.k];
  if (fld.type === "yn") return ynSelect(fld.k, v);
  if (fld.type === "text") return '<input type="text" data-sig="' + fld.k + '" value="' + esc(v || "") + '" placeholder="' + esc(fld.ph || "") + '">';
  if (fld.type === "select") return '<select data-sig="' + fld.k + '">' + fld.opts.map(o => '<option value="' + o[0] + '"' + (o[0] === (v || "") ? " selected" : "") + ">" + esc(o[1]) + "</option>").join("") + "</select>";
  if (fld.type === "multi") {
    const arr = Array.isArray(v) ? v : [];
    return '<div class="multi">' + fld.opts.map(o => '<label><input type="checkbox" data-sig="' + fld.k + '" value="' + o[0] + '"' + (arr.indexOf(o[0]) >= 0 ? " checked" : "") + ">" + esc(o[1]) + "</label>").join("") + "</div>";
  }
  return "";
}
function notesField(key, val, label) {
  return '<div class="field"><label>' + esc(label || "Notes") + '</label><textarea data-notes="' + esc(key) + '" placeholder="Observations, endpoints, results...">' + esc(val || "") + "</textarea></div>";
}
function badges(cat) {
  return '<div class="badges">'
    + '<span class="badge sev sev-' + cat.severity + '">' + esc(cat.severity) + "</span>"
    + '<span class="badge fam">' + esc(FAM_BY[cat.family]) + "</span>"
    + "</div>";
}
function catBodyHtml(cat) {
  let h = "";
  if (cat.lead) h += mdToHtml(cat.lead);
  for (const s of cat.sections) {
    h += '<h3 class="md-h">' + esc(s.title) + "</h3>";
    if (s.body) h += mdToHtml(s.body);
    for (const u of s.subs) { h += '<div class="sub-head">' + esc(u.title) + "</div>"; if (u.body) h += mdToHtml(u.body); }
  }
  return h;
}
function catChecklistHtml(cat, rec) {
  let h = "";
  if (cat.lead) h += '<div class="doc">' + mdToHtml(cat.lead) + "</div>";
  cat.sections.forEach((s, i) => {
    const on = !!(rec.checks && rec.checks[i]);
    h += '<div class="section' + (on ? " checked" : "") + '">'
      + '<div class="section-head"><input type="checkbox" data-check="' + i + '"' + (on ? " checked" : "") + '>'
      + '<span class="st" data-check-lbl="' + i + '">' + esc(s.title) + "</span></div>"
      + '<div class="section-body doc">' + (s.body ? mdToHtml(s.body) : "");
    for (const u of s.subs) { h += '<div class="sub-head">' + esc(u.title) + "</div>"; if (u.body) h += mdToHtml(u.body); }
    h += "</div></div>";
  });
  return h;
}
function crumb(parts) { return '<div class="breadcrumb">' + parts.map(esc).join('<span class="sep">/</span>') + "</div>"; }

function renderContent() {
  const el = $("#content"); if (!el) return;
  const s = parseSel(SEL); let h = "";

  if (s.type === "recon") {
    h += crumb(["Recon and setup", "Recon"]);
    h += '<h1 class="page-title">Recon (entry point)</h1>';
    h += '<p class="page-lead">Enumerate domains, resolve them, find live hosts and open ports. Record findings here; each live web service becomes an assessment under Pages.</p>';
    h += '<div class="doc">' + mdToHtml(DATA.recon.markdown) + "</div>";
    h += notesField("recon", STATE.recon.notes, "Recon findings and notes");
  }
  else if (s.type === "stack") {
    h += crumb(["Recon and setup", "Stack recon"]);
    h += '<h1 class="page-title">Stack recon</h1>';
    h += '<p class="page-lead">Fingerprint the target. The profile below drives relevance: categories that cannot apply are auto-marked N/A across every functionality and propagate down the tree.</p>';
    h += '<div class="group-card"><h3>Target profile (drives relevance)</h3><div class="sig-grid">';
    for (const g of SIGNAL_FIELDS) for (const fld of g.fields)
      h += '<div class="field"><label>' + esc(fld.label) + "</label>" + sigControl(fld) + "</div>";
    h += "</div></div>";
    h += '<div class="doc">' + mdToHtml(DATA.stack.fingerprinting) + "</div>";
    for (const g of DATA.stack.questionGroups) {
      h += '<div class="group-card"><h3>' + esc(g.group) + "</h3>";
      for (const q of g.questions)
        h += '<div class="field"><label>' + inlineMd(q.q) + '</label><input type="text" data-qid="' + esc(q.id) + '" value="' + esc(STATE.stack.answers[q.id] || "") + '"></div>';
      h += "</div>";
    }
    h += notesField("stack", STATE.stack.notes, "Stack recon notes");
  }
  else if (s.type === "files") {
    h += crumb(["Recon and setup", "File discovery"]);
    h += '<h1 class="page-title">File discovery</h1>';
    h += '<div class="doc">' + mdToHtml(DATA.files.intro) + "</div>";
    for (const l of DATA.files.lists) {
      h += '<h2 class="md-h">' + esc(l.name) + "</h2>";
      if (l.extensions) h += '<div class="doc">' + codeblock(l.extensions) + "</div>";
      if (l.command) h += '<div class="doc">' + codeblock(l.command) + "</div>";
    }
    h += notesField("files", STATE.files.notes, "File discovery results");
  }
  else if (s.type === "dast-intro") {
    h += crumb(["Reference", "DAST overview"]);
    h += '<h1 class="page-title">DAST overview</h1>';
    h += '<div class="doc">' + mdToHtml(DATA.dast.intro) + "</div>";
  }
  else if (s.type === "ref") {
    const cat = CAT_BY[s.slug];
    if (!cat) { select("dast-intro"); return; }
    h += crumb(["Reference", FAM_BY[cat.family], cat.name]);
    h += '<h1 class="page-title">' + esc(cat.title) + "</h1>" + badges(cat);
    const na = categoryNA(cat);
    h += '<div class="banner ' + (na ? "na" : "show") + '">' + (na
      ? "<b>Auto N/A</b> given the current target profile: " + esc(na) + ". It still applies if that changes."
      : "<b>In scope</b> for the current target profile.")
      + ' Open this category inside a functionality (under Pages) to track progress and notes.</div>';
    h += '<div class="doc">' + catBodyHtml(cat) + "</div>";
  }
  else if (s.type === "page") {
    const page = getPage(s.pid);
    if (!page) { select("recon"); return; }
    h += crumb(["Assessment", page.name || "(page)"]);
    h += '<h1 class="page-title">Page</h1>';
    h += '<div class="field"><label>Name or path</label><input type="text" data-page-name="' + esc(page.id) + '" value="' + esc(page.name) + '" placeholder="/order"></div>';
    h += '<div class="field"><label>URL</label><input type="text" data-page-url="' + esc(page.id) + '" value="' + esc(page.url || "") + '" placeholder="https://target/order"></div>';
    h += notesField("page:" + page.id, page.notes, "Page notes (what it does, what it loads)");
    h += '<div class="rowflex"><button class="btn gold" data-act="add-func" data-pid="' + esc(page.id) + '" type="button">+ Add functionality</button>';
    h += '<button class="btn danger" data-act="del-page" data-pid="' + esc(page.id) + '" type="button">Delete page</button></div>';
    if (page.funcs.length) {
      h += '<div class="cat-list">';
      for (const f of page.funcs) { const pr = funcProgress(f); h += '<div class="cat-item" data-open="func:' + esc(page.id) + ":" + esc(f.id) + '"><span class="nm">' + esc(f.name || "(functionality)") + '</span><span class="why">' + pr.done + "/" + pr.shown + " done</span></div>"; }
      h += "</div>";
    } else h += '<p class="empty">No functionality yet. Add the actions this page exposes (login, search, upload, place order...).</p>';
  }
  else if (s.type === "func") {
    const page = getPage(s.pid); const f = getFunc(s.pid, s.fid);
    if (!f) { select("recon"); return; }
    const pr = funcProgress(f);
    h += crumb(["Assessment", page.name || "(page)", f.name || "(functionality)"]);
    h += '<h1 class="page-title">Functionality</h1>';
    h += '<div class="field"><label>Name</label><input type="text" data-func-name="' + esc(page.id) + ":" + esc(f.id) + '" value="' + esc(f.name) + '" placeholder="Place an order"></div>';
    h += notesField("func:" + page.id + ":" + f.id, f.notes, "What this does, the tech/mechanisms it uses");
    h += '<div class="rowflex"><span class="progress">' + pr.done + " / " + pr.shown + ' in scope done</span>'
      + '<button class="btn sm" data-act="toggle-na" type="button">' + (STATE.ui.showNA ? "Hide" : "Show") + ' N/A</button>'
      + '<button class="btn danger sm" data-act="del-func" data-pid="' + esc(page.id) + '" data-fid="' + esc(f.id) + '" type="button">Delete functionality</button></div>';
    for (const fam of DATA.dast.families) {
      const cats = catsOfFamily(fam.key).map(c => ({ c, e: catEffective(f, c.slug) }))
        .filter(x => STATE.ui.showNA || x.e.eff === "show");
      if (!cats.length) continue;
      h += '<div class="fam-label">' + esc(fam.title) + "</div><div class=\"cat-list\">";
      for (const x of cats) {
        const rec = catRecRO(f, x.c.slug); const p = catProgress(rec, x.c);
        h += '<div class="cat-item' + (x.e.eff === "na" ? " na" : "") + '" data-open="fcat:' + esc(page.id) + ":" + esc(f.id) + ":" + esc(x.c.slug) + '">'
          + '<span class="sev sev-' + x.c.severity + '"></span><span class="nm">' + esc(x.c.name) + "</span>"
          + (x.e.eff === "na" ? '<span class="why">N/A: ' + esc(x.e.reason) + "</span>"
            : '<span class="why">' + (x.e.status === "done" ? "done" : (p.total ? p.done + "/" + p.total : x.e.status)) + "</span>")
          + "</div>";
      }
      h += "</div>";
    }
  }
  else if (s.type === "fcat") {
    const page = getPage(s.pid); const f = getFunc(s.pid, s.fid); const cat = CAT_BY[s.slug];
    if (!f || !cat) { select("recon"); return; }
    const rec = catRecRO(f, s.slug); const e = catEffective(f, s.slug); const p = catProgress(rec, cat);
    h += crumb(["Assessment", page.name || "(page)", f.name || "(functionality)", cat.name]);
    h += '<h1 class="page-title">' + esc(cat.title) + "</h1>" + badges(cat);
    h += '<div class="banner ' + (e.eff === "na" ? "na" : "show") + '">'
      + (e.eff === "na" ? "<b>N/A</b> " + esc(e.reason) + (e.ov === "auto" ? " (auto). Set Applicability to Relevant to force it in scope." : ".")
        : "<b>In scope.</b>" + (e.auto ? " Auto rule would mark it N/A (" + esc(e.auto) + ") but it is forced relevant." : ""))
      + "</div>";
    h += '<div class="ctrlbar">';
    h += '<div class="fld"><label>Applicability</label><select data-ov>'
      + ["auto", "relevant", "na"].map(o => '<option value="' + o + '"' + (o === e.ov ? " selected" : "") + ">" + ({ auto: "Auto", relevant: "Relevant", na: "N/A" })[o] + "</option>").join("") + "</select></div>";
    h += '<div class="fld"><label>Status</label><select data-status>'
      + [["todo", "To do"], ["doing", "In progress"], ["done", "Done"]].map(o => '<option value="' + o[0] + '"' + (o[0] === e.status ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></div>";
    if (cat.sections.length) h += '<span class="progress">' + p.done + " / " + p.total + " steps</span>";
    h += "</div>";
    h += catChecklistHtml(cat, rec);
    h += notesField("fcat:" + page.id + ":" + f.id + ":" + s.slug, rec.notes, "Notes for this category on this functionality");
  }
  el.innerHTML = h;
}

/* --------------------------------------------------------------- mutations */
function addPage() { const p = { id: uid(), name: "New page", url: "", notes: "", funcs: [] }; STATE.pages.push(p); STATE.ui.collapsed["page:" + p.id] = false; select("page:" + p.id); }
function addFunc(pid) { const p = getPage(pid); if (!p) return; const f = { id: uid(), name: "New functionality", notes: "", cats: {} }; p.funcs.push(f); STATE.ui.collapsed["page:" + pid] = false; STATE.ui.collapsed["func:" + pid + ":" + f.id] = false; select("func:" + pid + ":" + f.id); }
function delPage(pid) { if (!confirm("Delete this page and all its functionalities?")) return; STATE.pages = STATE.pages.filter(p => p.id !== pid); select("recon"); }
function delFunc(pid, fid) { if (!confirm("Delete this functionality?")) return; const p = getPage(pid); if (p) p.funcs = p.funcs.filter(f => f.id !== fid); select(p ? "page:" + pid : "recon"); }

/* ------------------------------------------------------------------ events */
function onTreeClick(ev) {
  const tog = ev.target.closest("[data-toggle]");
  if (tog) { const k = tog.getAttribute("data-toggle"); STATE.ui.collapsed[k] = !collapsed(k, (k.indexOf("fam:") === 0)); renderTree(); return; }
  const act = ev.target.closest("[data-act]");
  if (act) {
    const a = act.getAttribute("data-act");
    if (a === "add-page") addPage();
    else if (a === "add-func") addFunc(act.getAttribute("data-pid"));
    else if (a === "toggle-na") { STATE.ui.showNA = !STATE.ui.showNA; renderTree(); if (parseSel(SEL).type === "func") renderContent(); }
    return;
  }
  const r = ev.target.closest("[data-sel]");
  if (r) select(r.getAttribute("data-sel"));
}
function onContentClick(ev) {
  const cp = ev.target.closest(".copy");
  if (cp) { const pre = cp.parentElement.querySelector("pre"); copyText(pre ? pre.textContent : "", cp); return; }
  const op = ev.target.closest("[data-open]");
  if (op) { select(op.getAttribute("data-open")); return; }
  const act = ev.target.closest("[data-act]");
  if (act) {
    const a = act.getAttribute("data-act");
    if (a === "add-func") addFunc(act.getAttribute("data-pid"));
    else if (a === "del-page") delPage(act.getAttribute("data-pid"));
    else if (a === "del-func") delFunc(act.getAttribute("data-pid"), act.getAttribute("data-fid"));
    else if (a === "toggle-na") { STATE.ui.showNA = !STATE.ui.showNA; renderTree(); renderContent(); }
    return;
  }
  const lbl = ev.target.closest("[data-check-lbl]");
  if (lbl) { const box = lbl.parentElement.querySelector('input[data-check]'); if (box) { box.checked = !box.checked; box.dispatchEvent(new Event("change", { bubbles: true })); } }
}
function onContentChange(ev) {
  const t = ev.target;
  if (t.matches("[data-sig]")) { applySignal(t); renderTree(); return; }
  if (t.matches("[data-check]")) {
    const s = parseSel(SEL); if (s.type !== "fcat") return;
    const rec = catRec(getFunc(s.pid, s.fid), s.slug); if (!rec.checks) rec.checks = {};
    rec.checks[+t.getAttribute("data-check")] = t.checked;
    t.closest(".section").classList.toggle("checked", t.checked);
    const cat = CAT_BY[s.slug]; const p = catProgress(rec, cat);
    const pr = $(".ctrlbar .progress"); if (pr) pr.textContent = p.done + " / " + p.total + " steps";
    renderTree(); return;
  }
  if (t.matches("[data-ov]")) { const s = parseSel(SEL); catRec(getFunc(s.pid, s.fid), s.slug).override = t.value; renderTree(); renderContent(); return; }
  if (t.matches("[data-status]")) { const s = parseSel(SEL); catRec(getFunc(s.pid, s.fid), s.slug).status = t.value; renderTree(); renderContent(); return; }
}
function onContentInput(ev) {
  const t = ev.target;
  if (t.matches("[data-sig][type=text]")) { applySignal(t); return; }
  if (t.matches("[data-qid]")) { STATE.stack.answers[t.getAttribute("data-qid")] = t.value; return; }
  if (t.matches("[data-notes]")) { setNotes(t.getAttribute("data-notes"), t.value); return; }
  if (t.matches("[data-page-name]")) { const p = getPage(t.getAttribute("data-page-name")); if (p) { p.name = t.value; renderTree(); } return; }
  if (t.matches("[data-page-url]")) { const p = getPage(t.getAttribute("data-page-url")); if (p) p.url = t.value; return; }
  if (t.matches("[data-func-name]")) { const a = t.getAttribute("data-func-name").split(":"); const f = getFunc(a[0], a[1]); if (f) { f.name = t.value; renderTree(); } return; }
}
function applySignal(t) {
  const k = t.getAttribute("data-sig");
  if (t.type === "checkbox") {
    const boxes = $$('[data-sig="' + k + '"]', $("#content"));
    STATE.stack.signals[k] = boxes.filter(b => b.checked).map(b => b.value);
  } else STATE.stack.signals[k] = t.value;
}
function setNotes(key, val) {
  const s = parseSel(key);
  if (key === "recon") STATE.recon.notes = val;
  else if (key === "stack") STATE.stack.notes = val;
  else if (key === "files") STATE.files.notes = val;
  else if (s.type === "page") { const p = getPage(s.pid); if (p) p.notes = val; }
  else if (s.type === "func") { const f = getFunc(s.pid, s.fid); if (f) f.notes = val; }
  else if (s.type === "fcat") { catRec(getFunc(s.pid, s.fid), s.slug).notes = val; }
}
function copyText(text, btn) {
  const done = () => { if (btn) { const o = btn.textContent; btn.textContent = "Copied"; btn.classList.add("ok"); setTimeout(() => { btn.textContent = o; btn.classList.remove("ok"); }, 1100); } };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  else fallbackCopy(text, done);
}
function fallbackCopy(text, done) { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(ta); done && done(); }

/* ------------------------------------------------------------- save / open */
function saveSession() {
  const blob = new Blob([JSON.stringify(STATE, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  const d = new Date(); const stamp = d.toISOString().slice(0, 10);
  a.href = url; a.download = "mononoke-session-" + stamp + ".json"; document.body.appendChild(a); a.click();
  document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function openSession() { $("#file-input").click(); }
function loadFile(file) {
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { alert("File too large."); return; }
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data || data.app !== "mononoke") { if (!confirm("This file is not a Mononoke session. Load anyway?")) return; }
      STATE = Object.assign(emptyState(), data);
      STATE.ui = Object.assign({ collapsed: {}, showNA: false, lastSel: "recon" }, data.ui || {});
      STATE.pages = (data.pages || []).map(p => ({ id: p.id || uid(), name: p.name || "", url: p.url || "", notes: p.notes || "", funcs: (p.funcs || []).map(f => ({ id: f.id || uid(), name: f.name || "", notes: f.notes || "", cats: f.cats || {} })) }));
      closeHome(); select(STATE.ui.lastSel || "recon");
    } catch (e) { alert("Could not read this session file: " + e.message); }
  };
  r.readAsText(file);
}
function newSession() { if (STATE.pages.length && !confirm("Start a new assessment? Unsaved work will be lost.")) return; STATE = emptyState(); closeHome(); select("recon"); }

/* ----------------------------------------------------------------- palette */
let PINDEX = null, PRES = [], PSEL = 0;
function buildIndex() {
  const idx = [];
  idx.push({ title: "Recon (entry point)", ctx: "Setup", sel: "recon", hay: ("recon " + DATA.recon.markdown).toLowerCase() });
  idx.push({ title: "Stack recon", ctx: "Setup", sel: "stack", hay: ("stack recon fingerprint " + DATA.stack.fingerprinting).toLowerCase() });
  idx.push({ title: "File discovery", ctx: "Setup", sel: "files", hay: ("file discovery dirsearch " + DATA.files.intro).toLowerCase() });
  idx.push({ title: "DAST overview", ctx: "Reference", sel: "dast-intro", hay: ("dast overview " + DATA.dast.intro).toLowerCase() });
  for (const g of DATA.stack.questionGroups) for (const q of g.questions)
    idx.push({ title: q.q, ctx: "Question / " + g.group, sel: "stack", hay: q.q.toLowerCase() });
  for (const c of CATS) {
    let body = c.lead + " ";
    for (const s of c.sections) { body += s.title + " " + s.body + " "; for (const u of s.subs) body += u.title + " " + u.body + " "; }
    idx.push({ title: c.name, ctx: FAM_BY[c.family], sel: "ref:" + c.slug, hay: (c.title + " " + body).toLowerCase() });
    for (const s of c.sections)
      idx.push({ title: c.name + " › " + s.title, ctx: FAM_BY[c.family], sel: "ref:" + c.slug, hay: (c.name + " " + s.title + " " + s.body).toLowerCase() });
  }
  return idx;
}
function runSearch(q) {
  q = q.trim().toLowerCase();
  const res = $("#palette-results");
  if (!q) { PRES = []; res.innerHTML = '<div class="pr"><span class="pg">Type to search techniques, payloads and questions.</span></div>'; return; }
  const terms = q.split(/\s+/);
  const scored = [];
  for (const it of (PINDEX || (PINDEX = buildIndex()))) {
    let ok = true, score = 0;
    for (const t of terms) { if (it.hay.indexOf(t) < 0) { ok = false; break; } if (it.title.toLowerCase().indexOf(t) >= 0) score += 3; }
    if (ok) scored.push({ it, score });
  }
  scored.sort((a, b) => b.score - a.score);
  PRES = scored.slice(0, 40).map(x => x.it); PSEL = 0;
  res.innerHTML = PRES.length ? PRES.map((it, i) =>
    '<div class="pr' + (i === 0 ? " sel" : "") + '" data-i="' + i + '"><span class="pt">' + hlt(it.title, terms) + '</span><span class="pc">' + esc(it.ctx) + "</span></div>").join("")
    : '<div class="pr"><span class="pg">No match.</span></div>';
}
function hlt(s, terms) { let t = esc(s); for (const term of terms) { if (!term) continue; const re = new RegExp("(" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"); t = t.replace(re, "<mark>$1</mark>"); } return t; }
function openPalette() { $("#palette-ov").classList.add("open"); const i = $("#palette-input"); i.value = ""; runSearch(""); i.focus(); }
function closePalette() { $("#palette-ov").classList.remove("open"); }
function paletteGo(i) { const it = PRES[i]; if (!it) return; closePalette(); select(it.sel); }

/* homepage */
function showHome() { $("#home").classList.add("open"); }
function closeHome() { $("#home").classList.remove("open"); }

/* --------------------------------------------------------------------- init */
function init() {
  $("#home-disc").textContent = DATA.meta.note + " Methodology synthesized from the user's notes and the PortSwigger Web Security Academy. In-memory only: use Save to export your session.";
  renderTree(); renderContent();

  $("#tree").addEventListener("click", onTreeClick);
  const c = $("#content");
  c.addEventListener("click", onContentClick);
  c.addEventListener("change", onContentChange);
  c.addEventListener("input", onContentInput);

  $("#btn-new").addEventListener("click", newSession);
  $("#btn-save").addEventListener("click", saveSession);
  $("#btn-open").addEventListener("click", openSession);
  $("#btn-search").addEventListener("click", openPalette);
  $("#home-new").addEventListener("click", newSession);
  $("#home-open").addEventListener("click", openSession);
  $("#file-input").addEventListener("change", e => { loadFile(e.target.files[0]); e.target.value = ""; });

  $("#palette-ov").addEventListener("click", e => { if (e.target.id === "palette-ov") closePalette(); });
  $("#home").addEventListener("click", e => { if (e.target.id === "home") closeHome(); });
  $("#palette-input").addEventListener("input", e => runSearch(e.target.value));
  $("#palette-results").addEventListener("click", e => { const r = e.target.closest(".pr[data-i]"); if (r) paletteGo(+r.getAttribute("data-i")); });

  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
    if ($("#palette-ov").classList.contains("open")) {
      if (e.key === "Escape") closePalette();
      else if (e.key === "ArrowDown") { e.preventDefault(); PSEL = Math.min(PSEL + 1, PRES.length - 1); paintSel(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); PSEL = Math.max(PSEL - 1, 0); paintSel(); }
      else if (e.key === "Enter") { e.preventDefault(); paletteGo(PSEL); }
    } else if (e.key === "Escape" && $("#home").classList.contains("open")) closeHome();
  });

  /* sidebar resizer */
  const rez = $("#resizer"), sb = $("#sidebar");
  rez.addEventListener("mousedown", e => {
    e.preventDefault(); const move = ev => { const w = Math.max(200, Math.min(620, ev.clientX)); sb.style.width = w + "px"; };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  });

  showHome();
}
function paintSel() { $$(".pr[data-i]").forEach((r, i) => r.classList.toggle("sel", i === PSEL)); const sel = $(".pr.sel"); if (sel) sel.scrollIntoView({ block: "nearest" }); }

document.addEventListener("DOMContentLoaded", init);
})();
