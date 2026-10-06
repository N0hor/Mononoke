#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Parse the 3 methodology markdown docs into app/data.js (window.DATA = {...}).
# Content is preserved verbatim; structure + families + relevance rules are attached.
import json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root (parent of app/)
OUT  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.js")

def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read().replace("\r\n", "\n")

entry    = read("Entry point.md")
webentry = read("port_and_service/webapp/Web application entry point.md")
dast     = read("port_and_service/webapp/DAST.md")

HEAD = re.compile(r'^(#{1,6})\s+(.*\S)\s*$')

def tokens(text):
    """Yield ('heading',level,title,raw) or ('line',0,None,raw), ignoring headings inside ``` fences."""
    infence = False
    for line in text.split("\n"):
        if line.strip().startswith("```"):
            infence = not infence
            yield ("line", 0, None, line); continue
        if not infence:
            m = HEAD.match(line)
            if m:
                yield ("heading", len(m.group(1)), m.group(2).strip(), line); continue
        yield ("line", 0, None, line)

def fenced_blocks(chunk):
    blocks = []; infence = False; buf = []; lang = None
    for line in chunk.split("\n"):
        st = line.strip()
        if st.startswith("```"):
            if not infence:
                infence = True; lang = st[3:].strip(); buf = []
            else:
                blocks.append({"lang": lang, "code": "\n".join(buf)}); infence = False
        elif infence:
            buf.append(line)
    return blocks

def slugify(s):
    s = s.lower()
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s or "x"

# ----------------------------------------------------------------------------
# DAST.md : intro + 50 categories (H3) -> lead + sections (H4) + subs (H5)
# ----------------------------------------------------------------------------
items = list(tokens(dast))
i = 0
intro_lines = []
while i < len(items) and not (items[i][0] == "heading" and items[i][1] == 3):
    intro_lines.append(items[i][3]); i += 1
dast_intro = "\n".join(intro_lines).strip()

raw_cats = []
while i < len(items):
    assert items[i][0] == "heading" and items[i][1] == 3, items[i]
    title = items[i][2]; i += 1
    body = []
    while i < len(items) and not (items[i][0] == "heading" and items[i][1] == 3):
        body.append(items[i]); i += 1
    raw_cats.append((title, body))

def parse_body(body):
    lead = []; j = 0
    while j < len(body) and not (body[j][0] == "heading" and body[j][1] == 4):
        lead.append(body[j][3]); j += 1
    sections = []
    while j < len(body):
        assert body[j][0] == "heading" and body[j][1] == 4
        sec_title = body[j][2]; j += 1
        sec = []
        while j < len(body) and not (body[j][0] == "heading" and body[j][1] in (4, 5)):
            sec.append(body[j][3]); j += 1
        subs = []
        while j < len(body) and body[j][0] == "heading" and body[j][1] == 5:
            sub_title = body[j][2]; j += 1
            sub = []
            while j < len(body) and not (body[j][0] == "heading" and body[j][1] in (4, 5)):
                sub.append(body[j][3]); j += 1
            subs.append({"title": sub_title, "body": "\n".join(sub).strip()})
        sections.append({"title": sec_title, "body": "\n".join(sec).strip(), "subs": subs})
    return "\n".join(lead).strip(), sections

# families
FAM = [
    ("A", "Server-side injection"),
    ("B", "File, path and request forgery"),
    ("C", "Access control"),
    ("D", "Authentication and session"),
    ("E", "HTTP, cache and infrastructure"),
    ("F", "API"),
    ("G", "Client-side (XSS and DOM)"),
    ("H", "Logic, disclosure and other"),
]

def na(sig, op, val, reason):
    return {"sig": sig, "op": op, "val": val, "reason": reason}

# ordered config for the 50 categories: (prefix_check, slug, short_name, family, severity, [na...])
CFG = [
 ("sqli",                       "sqli",                 "SQL injection",               "A","critical",[na("db","in",["nosql","none"],"Database is NoSQL only or absent")]),
 ("nosql",                      "nosql",                "NoSQL injection",             "A","high",    [na("db","in",["sql","none"],"Database is SQL only or absent")]),
 ("os command",                 "os-command",           "OS command injection",        "A","critical",[]),
 ("server-side template",       "ssti",                 "Template injection (SSTI)",   "A","critical",[na("templating","eq","none","No server-side templating")]),
 ("xml external entity",        "xxe",                  "XXE",                         "A","high",    [na("xml","eq","no","No XML processing")]),
 ("ldap",                       "ldap",                 "LDAP injection",              "A","high",    [na("ldap","eq","no","No LDAP / directory")]),
 ("insecure deserialization",   "deserialization",      "Insecure deserialization",    "B","critical",[na("serialization","eq","no","No native serialization")]),
 ("path traversal",             "path-traversal",       "Path traversal / LFI / RFI",  "B","high",    []),
 ("insecure file upload",       "file-upload",          "File upload",                 "B","critical",[na("fileUpload","eq","no","No file upload")]),
 ("ssrf",                       "ssrf",                 "SSRF",                        "B","high",    [na("serverFetch","eq","no","No server-side fetch from user input")]),
 ("host header",                "host-header",          "Host header",                 "B","medium",  []),
 ("difference between",         "frontend-backend-diff","Frontend vs backend",         "C","medium",  []),
 ("missing authentication",     "missing-auth",         "Missing authentication",      "C","high",    []),
 ("idor",                       "idor",                 "IDOR",                        "C","high",    []),
 ("verb tempering",             "verb-tampering",       "Verb tampering",              "C","medium",  []),
 ("username enumeration",       "username-enum",        "Username enumeration",        "D","medium",  [na("auth","eq","no","No authentication")]),
 ("brute-force (",              "brute-force",          "Brute-force",                 "D","medium",  [na("auth","eq","no","No authentication")]),
 ("2fa",                        "twofa-bypass",         "2FA bypass",                  "D","high",    [na("auth","eq","no","No authentication"), na("twofa","eq","no","No 2FA")]),
 ("password reset",             "password-reset",       "Password reset",              "D","high",    [na("auth","eq","no","No authentication")]),
 ("predictable stay",          "predictable-cookie",   "Stay-logged-in cookie",       "D","medium",  [na("auth","eq","no","No authentication"), na("remember","eq","no","No stay-logged-in feature")]),
 ("brute-force via the password","brute-force-pwd-change","Brute-force (password change)","D","medium",[na("auth","eq","no","No authentication")]),
 ("jwt",                        "jwt",                  "JWT",                         "D","high",    [na("session","excludes","jwt","Sessions do not use JWT")]),
 ("oauth",                      "oauth",                "OAuth",                       "D","high",    [na("oauth","eq","no","No OAuth / SSO")]),
 ("http request smuggling",     "request-smuggling",    "Request smuggling",           "E","critical",[na("edgeCache","eq","no","No reverse proxy / cache / CDN")]),
 ("web cache poisoning",        "cache-poisoning",      "Cache poisoning",             "E","high",    [na("edgeCache","eq","no","No reverse proxy / cache / CDN")]),
 ("web cache deception",        "cache-deception",      "Cache deception",             "E","medium",  [na("edgeCache","eq","no","No reverse proxy / cache / CDN")]),
 ("race conditions",            "race-conditions",      "Race conditions",             "E","medium",  []),
 ("server-side prototype",      "sspp",                 "Prototype pollution (server)","E","high",    [na("backendLang","excludes","nodejs","Backend is not Node.js")]),
 ("api:",                       "api",                  "API",                         "F","high",    [na("api","contains","none","No exposed API")]),
 ("graphql",                    "graphql",              "GraphQL",                     "F","high",    [na("api","excludes","graphql","API is not GraphQL")]),
 ("reflected, stored and dom",  "xss-reflected-stored-dom","XSS: reflected/stored/DOM","G","high",   []),
 ("contexts:",                  "xss-contexts",         "XSS: contexts",               "G","high",    []),
 ("filters:",                   "xss-filters",          "XSS: filters",                "G","medium",  []),
 ("angularjs",                  "angularjs",            "AngularJS",                   "G","medium",  [na("clientFramework","excludes","angularjs","No AngularJS")]),
 ("csp bypass",                 "csp-bypass",           "CSP bypass",                  "G","medium",  [na("csp","eq","no","No Content-Security-Policy")]),
 ("client-side template",       "csti",                 "Client-side template injection","G","medium",[na("clientFramework","contains","none","No client-side framework")]),
 ("sinks/sources:",             "dom-sinks-sources",    "DOM sinks / sources",         "G","medium",  []),
 ("web messages",               "postmessage",          "postMessage",                 "G","medium",  []),
 ("dom open redirect",          "dom-open-redirect",    "DOM open redirect",           "G","medium",  []),
 ("cookie manipulation",        "cookie-manipulation",  "Cookie manipulation",         "G","medium",  []),
 ("dom clobbering",             "dom-clobbering",        "DOM clobbering",             "G","medium",  []),
 ("client-side prototype",      "client-proto-pollution","Prototype pollution (client)","G","high",   []),
 ("csrf",                       "csrf",                 "CSRF",                        "G","medium",  [na("session","excludes","cookie","Sessions are not cookie-based")]),
 ("clickjacking",               "clickjacking",         "Clickjacking",                "G","low",     []),
 ("cors",                       "cors",                 "CORS",                        "G","medium",  []),
 ("cross-site websocket",       "cswsh",                "Cross-site WebSocket hijack", "G","high",    [na("websocket","eq","no","No WebSockets")]),
 ("information disclosure",      "info-disclosure",      "Information disclosure",      "H","low",     []),
 ("business logic",             "business-logic",       "Business logic",              "H","high",    []),
 ("websockets",                 "websockets",           "WebSockets",                  "H","medium",  [na("websocket","eq","no","No WebSockets")]),
 ("web llm",                    "web-llm",              "Web LLM",                     "H","medium",  [na("llm","eq","no","No LLM feature")]),
]

assert len(raw_cats) == 50, "expected 50 categories, got %d" % len(raw_cats)
assert len(CFG) == 50

categories = []
warnings = []
for idx, (title, body) in enumerate(raw_cats):
    prefix, slug, name, fam, sev, narules = CFG[idx]
    if not title.lower().startswith(prefix):
        warnings.append("ORDER? #%d expected '%s...' got '%s'" % (idx + 1, prefix, title))
    lead, sections = parse_body(body)
    categories.append({
        "slug": slug, "name": name, "title": title, "family": fam,
        "severity": sev, "na": narules, "lead": lead, "sections": sections,
    })

# Move the client-side family preamble paragraph (it sits at the tail of the
# previous category because it precedes the XSS H3 in the source).
XSS_PREAMBLE = "Prove attacker input is reflected or stored into a page"
for c in categories:
    if c["sections"]:
        last = c["sections"][-1]
        if XSS_PREAMBLE in last["body"]:
            parts = last["body"].split("\n\n")
            keep = [p for p in parts if XSS_PREAMBLE not in p]
            moved = [p for p in parts if XSS_PREAMBLE in p]
            last["body"] = "\n\n".join(keep).strip()
            # prepend to the XSS category lead
            for t in categories:
                if t["slug"] == "xss-reflected-stored-dom":
                    t["lead"] = ("\n\n".join(moved).strip() + "\n\n" + t["lead"]).strip()

# ----------------------------------------------------------------------------
# Web application entry point.md : stack recon + files discovery
# ----------------------------------------------------------------------------
w = list(tokens(webentry))
# locate top-level (# ) sections
def section_slice(items, level, title_contains):
    start = None
    for k, it in enumerate(items):
        if it[0] == "heading" and it[1] == level and title_contains.lower() in it[2].lower():
            start = k; break
    if start is None: return None, None
    end = len(items)
    for k in range(start + 1, len(items)):
        if items[k][0] == "heading" and items[k][1] <= level:
            end = k; break
    return start, end

s0, s1 = section_slice(w, 1, "Stack recon")
f0, f1 = section_slice(w, 1, "Files discovery")

stack_items = w[s0 + 1:s1]
# fingerprinting = lines before the first H3 group inside stack recon
fp_lines = []; k = 0
while k < len(stack_items) and not (stack_items[k][0] == "heading" and stack_items[k][1] == 3):
    fp_lines.append(stack_items[k][3]); k += 1
fingerprinting = "\n".join(fp_lines).strip()
# question groups
groups = []
while k < len(stack_items):
    g_title = stack_items[k][2]; k += 1
    qs = []
    while k < len(stack_items) and not (stack_items[k][0] == "heading" and stack_items[k][1] == 3):
        raw = stack_items[k][3]
        m = re.match(r'^\s*-\s+(.*\S)\s*$', raw)
        if m:
            qs.append({"id": slugify(g_title) + "-" + str(len(qs) + 1), "q": m.group(1)})
        k += 1
    groups.append({"group": g_title, "questions": qs})

# files discovery
files_items = w[f0 + 1:f1] if f0 is not None else []
fintro_lines = []; k = 0
while k < len(files_items) and not (files_items[k][0] == "heading" and files_items[k][1] == 3):
    fintro_lines.append(files_items[k][3]); k += 1
files_intro = "\n".join(fintro_lines).strip()
lists = []
while k < len(files_items):
    name = files_items[k][2].strip().rstrip(":").strip(); k += 1
    chunk = []
    while k < len(files_items) and not (files_items[k][0] == "heading" and files_items[k][1] == 3):
        chunk.append(files_items[k][3]); k += 1
    blocks = fenced_blocks("\n".join(chunk))
    exts = blocks[0]["code"] if len(blocks) >= 1 else ""
    cmd = blocks[1]["code"] if len(blocks) >= 2 else ""
    lists.append({"name": name, "extensions": exts, "command": cmd})

DATA = {
    "meta": {"name": "Mononoke", "subtitle": "DAST methodology support",
             "note": "Authorized testing only. Content from the user's methodology docs."},
    "recon": {"title": "Recon (entry point)", "markdown": entry.strip()},
    "stack": {"fingerprinting": fingerprinting, "questionGroups": groups},
    "files": {"intro": files_intro, "lists": lists},
    "dast": {"intro": dast_intro,
             "families": [{"key": k_, "title": t_} for (k_, t_) in FAM],
             "categories": categories},
}

with open(OUT, "w", encoding="utf-8") as f:
    f.write("// Auto-generated from the methodology docs. Do not edit by hand.\n")
    f.write("window.DATA = ")
    json.dump(DATA, f, ensure_ascii=False, indent=1)
    f.write(";\n")

# ---- report ----
print("categories:", len(categories))
print("families:", len(FAM))
print("stack question groups:", [(g["group"], len(g["questions"])) for g in groups])
print("files lists:", [(l["name"], len(l["extensions"]), len(l["command"])) for l in lists])
nsec = sum(len(c["sections"]) for c in categories)
nsub = sum(len(s["subs"]) for c in categories for s in c["sections"])
print("total H4 sections:", nsec, " total H5 subs:", nsub)
print("data.js bytes:", os.path.getsize(OUT))
if warnings:
    print("WARNINGS:"); [print(" ", x) for x in warnings]
else:
    print("no order warnings")
