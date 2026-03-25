#!/usr/bin/env node
/**
 * Plot Studio
 * Local component editor powered by Claude.
 *
 * Drop in your Plot root directory. Run: node plot-studio.js
 *
 * Requires:
 *   - ANTHROPIC_API_KEY in environment or .env file
 *   - express (already in your backend — run `npm install express` at root if needed)
 *   - Node 18+ (for native fetch)
 */

const fs   = require('fs')
const path = require('path')

// ─── Load .env ────────────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
    if (m) {
      const k = m[1].trim()
      const v = m[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('\n❌  ANTHROPIC_API_KEY not found.')
  console.error('    Add it to your .env file or export it in your shell.\n')
  process.exit(1)
}

let express
try { express = require('express') } catch {
  console.error('\n❌  express not found. Run: npm install express\n')
  process.exit(1)
}

// ─── Setup ────────────────────────────────────────────────────────────────────
const app          = express()
const PORT         = 3002
const PROJECT_ROOT = process.cwd()

app.use(express.json({ limit: '2mb' }))

// ─── File helpers ─────────────────────────────────────────────────────────────
function scanDir(dir, relBase, results) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    const rel  = path.join(relBase, entry.name)
    if (entry.isDirectory()) {
      scanDir(full, rel, results)
    } else if (/\.(jsx?|tsx?)$/.test(entry.name)) {
      results.push({ name: entry.name, path: rel, dir: relBase })
    }
  }
}

function safeResolve(filePath) {
  const full = path.resolve(PROJECT_ROOT, filePath)
  if (!full.startsWith(PROJECT_ROOT + path.sep) && full !== PROJECT_ROOT) return null
  return full
}

// ─── API Routes ───────────────────────────────────────────────────────────────

// GET /api/files
app.get('/api/files', (_req, res) => {
  const files = []
  for (const dir of ['frontend/src/components', 'frontend/src/hooks', 'frontend/src/utils']) {
    scanDir(path.join(PROJECT_ROOT, dir), dir, files)
  }
  res.json(files)
})

// GET /api/component?path=...
app.get('/api/component', (req, res) => {
  const full = safeResolve(req.query.path || '')
  if (!full) return res.status(403).json({ error: 'forbidden' })
  try {
    res.json({ content: fs.readFileSync(full, 'utf8'), path: req.query.path })
  } catch {
    res.status(404).json({ error: 'file not found' })
  }
})

// POST /api/component  { path, content }
app.post('/api/component', (req, res) => {
  const { path: filePath, content } = req.body
  if (!filePath || !content) return res.status(400).json({ error: 'path and content required' })
  const full = safeResolve(filePath)
  if (!full) return res.status(403).json({ error: 'forbidden' })
  try {
    fs.writeFileSync(full, content, 'utf8')
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/chat  { messages, currentFile, currentContent }
app.post('/api/chat', async (req, res) => {
  const { messages, currentFile, currentContent } = req.body

  const system = `You are a component editor for Plot, a social mapping platform for neighborhood-level organizing.

Stack: React + Vite, Tailwind CSS v4, DaisyUI v5 (known conflict: use Tailwind color utilities directly — bg-zinc-900, text-white, etc — not DaisyUI theme variables), Mapbox GL JS, PostgreSQL via Supabase.

Taxonomy: Geography → Movement → Idea → Task
  Movement  — named organizing effort tied to a specific place
  Idea      — concrete intervention within a movement
  Task      — assignable unit of work within an idea

Database tables: users, movements, ideas, tasks, needs, donations, comments, notifications

Styling (zinc dark theme):
  Backgrounds : bg-zinc-950, bg-zinc-900
  Borders     : border-zinc-700, border-zinc-800
  Text        : text-white (primary), text-zinc-400 (secondary / labels)
  Highlight   : text-yellow-400, bg-yellow-400
  Button      : bg-white text-black hover:bg-zinc-100

Component conventions:
  - Functional components with hooks only (no class components)
  - Named export per component + default export at bottom of file
  - JSDoc comment block at top: what it renders, what props it accepts
  - No PropTypes
  - Active voice in all UI copy — "View movement" not "Click to view"

Currently editing: ${currentFile || 'no file selected'}

Current file:
\`\`\`
${currentContent || '(no file loaded)'}
\`\`\`

Rules when the user requests a change:
  1. Return the COMPLETE updated file — every single line, no truncation, no "// rest unchanged"
  2. Wrap the code in a single fenced code block: \`\`\`jsx ... \`\`\`
  3. After the code block, write one sentence describing what changed — nothing more

Rules when the user asks a question (no code change needed):
  Answer directly. Do not return code unless asked.`

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system,
        messages
      })
    })

    const data = await apiRes.json()
    if (!apiRes.ok) return res.status(500).json({ error: data.error?.message || 'Claude API error' })

    const text        = data.content?.[0]?.text || ''
    const codeMatch   = text.match(/```(?:jsx?|tsx?|javascript|typescript)?\n([\s\S]*?)```/)
    const code        = codeMatch ? codeMatch[1].trimEnd() : null
    const explanation = code
      ? text.slice(text.lastIndexOf('```') + 3).trim()
      : text

    res.json({ text, code, explanation })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET / — serve studio UI
app.get('/', (_req, res) => res.send(html()))

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
┌──────────────────────────────────┐
│  Plot Studio  →  localhost:${PORT}  │
└──────────────────────────────────┘
  Keep Vite running on port 5174.
  Ctrl+C to stop.
`)
})

// ─── UI ───────────────────────────────────────────────────────────────────────
function html() { return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Plot Studio</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Berkeley+Mono&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#09090b;--surface:#18181b;--surface2:#27272a;
  --border:#3f3f46;--border-sub:#27272a;
  --text:#fafafa;--muted:#a1a1aa;--dim:#52525b;
  --accent:#facc15;--accent-dim:rgba(250,204,21,0.10);
  --green:#4ade80;--green-dim:rgba(74,222,128,0.08);--green-border:rgba(74,222,128,0.18);
  --red:#f87171;--red-dim:rgba(248,113,113,0.08);
  --mono:'Berkeley Mono','Fira Code',monospace;
  --sans:'DM Sans',system-ui,sans-serif;
}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--sans);font-size:13px;overflow:hidden}

/* ── Layout ── */
.shell{display:grid;grid-template-columns:248px 1fr;height:100vh;padding-bottom:22px}

/* ── Sidebar ── */
aside{background:var(--surface);border-right:1px solid var(--border-sub);display:flex;flex-direction:column;overflow:hidden}
.sb-head{padding:14px 16px;border-bottom:1px solid var(--border-sub);display:flex;align-items:center;gap:9px}
.logo{width:22px;height:22px;background:var(--accent);border-radius:5px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.logo svg{width:12px;height:12px;fill:#000}
.sb-title{font-weight:600;font-size:13px;letter-spacing:.02em}
.sb-tag{margin-left:auto;font-size:10px;color:var(--dim);background:var(--surface2);padding:2px 7px;border-radius:10px}
.sb-search{padding:8px 10px;border-bottom:1px solid var(--border-sub)}
.sb-search input{width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text);font-size:12px;font-family:var(--sans);outline:none}
.sb-search input::placeholder{color:var(--dim)}
.sb-search input:focus{border-color:var(--muted)}
.file-tree{flex:1;overflow-y:auto;padding:6px 0 24px}
.group-label{padding:8px 14px 4px;font-size:10px;font-weight:600;letter-spacing:.08em;color:var(--dim);text-transform:uppercase}
.file-item{padding:6px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;transition:background .1s}
.file-item:hover{background:var(--surface2)}
.file-item.active{background:var(--accent-dim);color:var(--accent)}
.file-item svg{flex-shrink:0;opacity:.45}
.file-item.active svg{opacity:1;color:var(--accent)}
.fname{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* ── Main ── */
main{display:grid;grid-template-rows:1fr 290px;overflow:hidden}

/* ── Code panel ── */
.code-panel{display:flex;flex-direction:column;overflow:hidden;border-bottom:1px solid var(--border-sub)}
.phead{padding:9px 16px;border-bottom:1px solid var(--border-sub);display:flex;align-items:center;gap:8px;flex-shrink:0;min-height:38px}
.plabel{font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--dim)}
.fpath{font-size:11px;color:var(--muted);font-family:var(--mono)}
.pactions{margin-left:auto;display:flex;gap:6px}

.btn{padding:5px 12px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;border:none;font-family:var(--sans);transition:all .15s;line-height:1}
.btn-ghost{background:transparent;color:var(--muted);border:1px solid var(--border)}
.btn-ghost:hover{background:var(--surface2);color:var(--text)}
.btn-apply{background:var(--green);color:#000}
.btn-apply:hover{opacity:.88}
.btn-discard{background:transparent;color:var(--muted);border:1px solid var(--border)}
.btn-discard:hover{background:var(--red-dim);color:var(--red);border-color:var(--red)}
.btn:disabled{opacity:.35;cursor:not-allowed}

.proposed-bar{padding:7px 16px;background:var(--green-dim);border-bottom:1px solid var(--green-border);display:flex;align-items:center;gap:10px;flex-shrink:0}
.proposed-bar.hidden{display:none}
.pdot{width:6px;height:6px;border-radius:50%;background:var(--green);flex-shrink:0}
.plabel2{font-size:12px;color:var(--green);flex:1}
.pbars{display:flex;gap:6px}

.code-area{flex:1;overflow:hidden;position:relative}
.code-scroll{height:100%;overflow:auto;padding:16px 20px}
pre{font-family:var(--mono);font-size:11.5px;line-height:1.7;color:#d4d4d8;white-space:pre}
.empty-state{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--dim)}
.empty-state p{font-size:12px}

/* ── Chat panel ── */
.chat-panel{display:flex;flex-direction:column;overflow:hidden}
.msgs{flex:1;overflow-y:auto;padding:10px 16px;display:flex;flex-direction:column;gap:10px}
.msg{display:flex;gap:10px}
.avatar{width:22px;height:22px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;margin-top:1px}
.msg.user .avatar{background:var(--surface2);color:var(--muted)}
.msg.claude .avatar{background:var(--accent);color:#000}
.mbody{flex:1;min-width:0}
.mtext{font-size:12.5px;line-height:1.6;color:var(--text)}
.msg.user .mtext{color:var(--muted)}
.badge{display:inline-flex;align-items:center;gap:5px;background:var(--green-dim);border:1px solid var(--green-border);color:var(--green);font-size:11px;padding:3px 8px;border-radius:4px;margin-top:6px;font-family:var(--mono)}

.input-row{padding:9px 14px 31px;border-top:1px solid var(--border-sub);display:flex;gap:8px;align-items:flex-end}
textarea.ci{flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-size:13px;font-family:var(--sans);outline:none;resize:none;min-height:36px;max-height:100px;line-height:1.5;overflow-y:auto}
textarea.ci::placeholder{color:var(--dim)}
textarea.ci:focus{border-color:var(--muted)}
.send{width:36px;height:36px;background:#fff;color:#000;border:none;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s}
.send:hover{background:#e4e4e7}
.send:disabled{opacity:.3;cursor:not-allowed}

/* ── Typing ── */
.typing{display:flex;align-items:center;gap:4px;padding:4px 0}
.typing span{width:4px;height:4px;background:var(--dim);border-radius:50%;animation:bob 1.2s infinite}
.typing span:nth-child(2){animation-delay:.2s}
.typing span:nth-child(3){animation-delay:.4s}
@keyframes bob{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}

/* ── Status bar ── */
.status{position:fixed;bottom:0;left:0;right:0;height:22px;background:var(--surface);border-top:1px solid var(--border-sub);display:flex;align-items:center;padding:0 16px;gap:16px;z-index:99}
.si{font-size:10.5px;color:var(--dim);display:flex;align-items:center;gap:5px}
.dot{width:5px;height:5px;border-radius:50%;background:var(--green)}
.dot.off{background:var(--dim)}

/* Scrollbar */
::-webkit-scrollbar{width:3px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
::-webkit-scrollbar-thumb:hover{background:var(--dim)}
</style>
</head>
<body>
<div class="shell">

  <aside>
    <div class="sb-head">
      <div class="logo"><svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5"/></svg></div>
      <span class="sb-title">Plot Studio</span>
      <span class="sb-tag">:3002</span>
    </div>
    <div class="sb-search">
      <input id="search" type="text" placeholder="Filter files…" oninput="filterFiles()">
    </div>
    <div class="file-tree" id="fileTree">
      <div style="padding:16px 14px;color:var(--dim);font-size:12px">Scanning src/…</div>
    </div>
  </aside>

  <main>
    <!-- Code panel -->
    <div class="code-panel">
      <div class="phead">
        <span class="plabel">Component</span>
        <span class="fpath" id="filePath">— no file selected</span>
        <div class="pactions">
          <button class="btn btn-ghost" id="openBtn" onclick="window.open('http://localhost:5173','_blank')" style="display:none">Open app ↗</button>
        </div>
      </div>

      <div class="proposed-bar hidden" id="propBar">
        <div class="pdot"></div>
        <span class="plabel2" id="propLabel">Change ready to apply</span>
        <div class="pbars">
          <button class="btn btn-discard" onclick="discard()">Discard</button>
          <button class="btn btn-apply" onclick="apply()">Apply &amp; save</button>
        </div>
      </div>

      <div class="code-area">
        <div class="code-scroll" id="codeScroll">
          <div class="empty-state" id="emptyState">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <p>Select a component from the sidebar</p>
          </div>
          <pre id="codeDisplay" style="display:none"></pre>
        </div>
      </div>
    </div>

    <!-- Chat panel -->
    <div class="chat-panel">
      <div class="phead"><span class="plabel">Chat with Claude</span></div>
      <div class="msgs" id="msgs">
        <div class="msg claude">
          <div class="avatar">C</div>
          <div class="mbody"><div class="mtext">Select a component and describe what you want to change. I'll show you the proposed code before saving anything.</div></div>
        </div>
      </div>
      <div class="input-row">
        <textarea class="ci" id="ci" placeholder="Describe a change…" rows="1" onkeydown="onKey(event)" oninput="grow(this)"></textarea>
        <button class="send" id="sendBtn" onclick="send()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  </main>
</div>

<div class="status">
  <div class="si"><div class="dot" id="apiDot"></div><span>Claude</span></div>
  <div class="si"><div class="dot off" id="viteDot"></div><span>Vite :5173</span></div>
  <div class="si" id="saveStatus"></div>
</div>

<script>
let allFiles = [], current = null, code = '', proposed = null, history = []

async function loadFiles() {
  try {
    const r = await fetch('/api/files')
    allFiles = await r.json()
    renderTree(allFiles)
  } catch {
    document.getElementById('fileTree').innerHTML = '<div style="padding:12px 14px;color:#f87171;font-size:12px">Could not scan src/</div>'
  }
}

function renderTree(files) {
  const el = document.getElementById('fileTree')
  if (!files.length) { el.innerHTML = '<div style="padding:12px 14px;color:var(--dim);font-size:12px">No .jsx/.tsx files found in src/</div>'; return }
  const groups = {}
  for (const f of files) { ;(groups[f.dir] = groups[f.dir] || []).push(f) }
  el.innerHTML = Object.entries(groups).map(([dir, items]) =>
    '<div>' +
    \`<div class="group-label">\${dir.replace('src/','')}</div>\` +
    items.map(f =>
      \`<div class="file-item \${current === f.path ? 'active' : ''}" onclick="pick('\${f.path}')" data-n="\${f.name.toLowerCase()}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span class="fname">\${f.name}</span>
      </div>\`).join('') +
    '</div>'
  ).join('')
}

function filterFiles() {
  const q = document.getElementById('search').value.toLowerCase()
  document.querySelectorAll('.file-item').forEach(el => { el.style.display = el.dataset.n.includes(q) ? '' : 'none' })
  document.querySelectorAll('.file-tree > div').forEach(g => {
    g.style.display = [...g.querySelectorAll('.file-item')].some(i => i.style.display !== 'none') ? '' : 'none'
  })
}

async function pick(path) {
  discard(); history = []
  document.getElementById('msgs').innerHTML = \`
    <div class="msg claude">
      <div class="avatar">C</div>
      <div class="mbody"><div class="mtext">Loaded <code style="font-family:var(--mono);font-size:11px;background:var(--surface2);padding:1px 5px;border-radius:3px">\${path.split('/').pop()}</code>. What would you like to change?</div></div>
    </div>\`
  try {
    const r = await fetch(\`/api/component?path=\${encodeURIComponent(path)}\`)
    const d = await r.json()
    current = path; code = d.content
    showCode(code)
    document.getElementById('filePath').textContent = path
    document.getElementById('openBtn').style.display = ''
    renderTree(allFiles)
  } catch (e) { console.error(e) }
}

function showCode(c) {
  document.getElementById('emptyState').style.display = 'none'
  const el = document.getElementById('codeDisplay')
  el.style.display = ''; el.textContent = c
}

async function send() {
  const inp = document.getElementById('ci')
  const txt = inp.value.trim()
  if (!txt || !current) return
  inp.value = ''; grow(inp)
  document.getElementById('sendBtn').disabled = true
  msg('user', txt)
  history.push({ role: 'user', content: txt })
  const tid = typing()
  try {
    const r = await fetch('/api/chat', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ messages: history, currentFile: current, currentContent: code })
    })
    const d = await r.json()
    rmTyping(tid)
    if (d.error) { msg('claude', '⚠ ' + d.error) }
    else {
      history.push({ role: 'assistant', content: d.text })
      if (d.code) { proposed = d.code; showProposed(d.code, d.explanation); msgBadge(d.explanation || 'Component updated') }
      else { msg('claude', d.text) }
    }
  } catch (e) { rmTyping(tid); msg('claude', 'Request failed: ' + e.message) }
  document.getElementById('sendBtn').disabled = false
  document.getElementById('ci').focus()
}

function showProposed(c, label) {
  showCode(c)
  const bar = document.getElementById('propBar')
  bar.classList.remove('hidden')
  document.getElementById('propLabel').textContent = label || 'Change ready to apply'
}

async function apply() {
  if (!proposed || !current) return
  try {
    const r = await fetch('/api/component', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ path: current, content: proposed })
    })
    const d = await r.json()
    if (d.success) {
      code = proposed; proposed = null
      document.getElementById('propBar').classList.add('hidden')
      document.getElementById('saveStatus').textContent = 'Saved — Vite hot-reloading…'
      setTimeout(() => { document.getElementById('saveStatus').textContent = '' }, 3000)
      msgBadge('Saved. Your app at localhost:5173 has hot-reloaded.')
    } else { msg('claude', 'Save failed: ' + (d.error || 'unknown')) }
  } catch (e) { msg('claude', 'Could not save: ' + e.message) }
}

function discard() {
  if (!proposed) return
  proposed = null
  document.getElementById('propBar').classList.add('hidden')
  if (code) showCode(code)
}

// Chat helpers
function msg(role, text) {
  const el = document.createElement('div')
  el.className = 'msg ' + role
  el.innerHTML = \`<div class="avatar">\${role === 'user' ? 'Y' : 'C'}</div><div class="mbody"><div class="mtext">\${esc(text)}</div></div>\`
  append(el)
}

function msgBadge(text) {
  const el = document.createElement('div')
  el.className = 'msg claude'
  el.innerHTML = \`<div class="avatar">C</div><div class="mbody"><div class="mtext">\${esc(text)}</div>
    <div class="badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>applied</div></div>\`
  append(el)
}

function typing() {
  const id = 'ty' + Date.now()
  const el = document.createElement('div')
  el.id = id; el.className = 'msg claude'
  el.innerHTML = '<div class="avatar">C</div><div class="mbody"><div class="typing"><span></span><span></span><span></span></div></div>'
  append(el); return id
}

function rmTyping(id) { document.getElementById(id)?.remove() }

function append(el) {
  const msgs = document.getElementById('msgs')
  msgs.appendChild(el)
  msgs.scrollTop = msgs.scrollHeight
}

function esc(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>')
}

function onKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

function grow(el) {
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 100) + 'px'
}

// Vite ping
async function pingVite() {
  try { await fetch('http://localhost:5173', { mode: 'no-cors' }); document.getElementById('viteDot').className = 'dot' }
  catch { document.getElementById('viteDot').className = 'dot off' }
}

loadFiles()
pingVite()
setInterval(pingVite, 8000)
</script>
</body>
</html>`
}
