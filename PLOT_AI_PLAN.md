# Plot AI Features — Plan (Five Modes Covered)

This plan defines Plot’s AI features and maps each to the five AI modes: **Generative**, **Assistive**, **Foundational**, **Agentive**, and **Predictive**. Build order is chosen for shipping and hiring-story clarity.

---

## The five AI modes (reference)

| Mode | Meaning | Plot use |
|------|--------|----------|
| **Generative** | Produces new content (text, suggestions, summaries) | Summaries, drafts, task lists, idea suggestions |
| **Assistive** | Helps users complete tasks (recommendations, review, guidance) | Content review, “improve with AI,” suggestions at point of need |
| **Foundational** | Base layer other features use (retrieval, enrichment, understanding) | Civic knowledge layer, semantic search, enriched map data |
| **Agentive** | Acts on the user’s behalf (creates records, posts, notifies) | AI creates tasks, posts updates, or triggers actions with confirmation |
| **Predictive** | Predicts outcomes, needs, or future state | High-need areas, underserved neighborhoods, re-engagement timing |

---

## Feature list (with modes and build order)

### 1. Summarize a movement’s ideas — *Build first*

**What it does:** For a single movement, AI produces key themes, discussion questions, or a one-page draft from its ideas.

**AI modes:** **Generative** (summary/draft), **Assistive** (helps facilitators).

**Build order:** 1

---

### 2. Creation-time support for Ideas and Movements — *Expanded*

**What it does:** While users are creating or editing an idea or movement, AI helps in one place (e.g. “Improve with AI” / “AI review”):

- **Task list generation** — From the description, suggest actionable tasks (e.g. vacant lot → community garden tasks).
- **Content review** — Inclusive-language / bias check, clarity, tone.
- **Suggestions** — E.g. “Consider adding a timeline,” “Similar movements include X.”

**AI modes:** **Generative** (tasks, suggestions), **Assistive** (review, guidance).

**Build order:** 2

---

### 3. Intelligent Idea Generation Assistant

**What it does:** When a user clicks the map to add an idea, AI uses location context (demographics, zoning, nearby ideas, etc.) to suggest project types and starter descriptions (e.g. food desert → Community Garden, Mobile Food Pantry Hub).

**AI modes:** **Generative** (suggestions), **Assistive** (reduces friction at point of need).

**Build order:** 3

---

### 4. Analyze map selection

**What it does:** User draws a region on the map; AI summarizes movements and ideas in that area (“What’s going on here?”, themes, opportunities).

**AI modes:** **Generative** (analysis/summary), **Assistive** (discovery).

**Build order:** 4

---

### 5. Civic knowledge foundation (foundational layer)

**What it does:** Base layer that other AI features use:

- **Semantic search / similarity** — Find similar ideas or movements (embeddings or simple retrieval) so “what’s worked elsewhere” and Co-Pilot answers can use the same data.
- **Optional:** Pre-compute or cache “civic knowledge” (e.g. movement/idea embeddings, key phrases) so summarization and suggestions are faster and consistent.

**AI modes:** **Foundational** (retrieval, understanding, enrichment for other features).

**Build order:** 5

---

### 6. Location Intelligence Layer (predictive + foundational)

**What it does:** Map becomes an insight layer:

- **Overlays** — e.g. “Areas with high community need” (from public data or simple heuristics).
- **Hover tooltips** — Census tract: income, tenure, community organizations.
- **Predictive surface** — “Neighborhoods likely underserved by current movements” or “No movements within X miles of this area.”
- **Impact visualization** — e.g. “Your movement’s ideas cover X% of the city’s food desert areas.”

**AI modes:** **Predictive** (high-need, underserved, impact), **Foundational** (enriched map data for other features).

**Build order:** 6

---

### 7. AI Co-Pilot for Movement Leaders (agentive + generative + assistive)

**What it does:** Chat-based assistant for organizers:

- **Generative / assistive:** “Help me write an update to re-engage members,” “What ideas from other climate movements have worked?,” “Draft a thank-you for top donors,” “Summarize the last 20 comments on idea X.”
- **Agentive (explicit):** AI can *perform* actions with confirmation, e.g.:
  - “Create these tasks from my idea” → AI creates task records in the movement.
  - “Post this update” / “Send this thank-you” → AI triggers the post/send (user confirms before sending).

**AI modes:** **Generative** (drafts, summaries), **Assistive** (guidance), **Agentive** (creates tasks, posts updates).

**Build order:** 7

---

## Coverage summary

| Mode | Features that demonstrate it |
|------|-----------------------------|
| **Generative** | 1, 2, 3, 4, 7 |
| **Assistive** | 1, 2, 3, 4, 7 |
| **Foundational** | 5, 6 |
| **Agentive** | 7 (create tasks, post/send with confirmation) |
| **Predictive** | 6 (high-need areas, underserved, impact) |

---

## Build order (implementation sequence)

1. Summarize a movement’s ideas  
2. Creation-time support (tasks, content review, suggestions)  
3. Intelligent Idea Generation (map-click → suggestions)  
4. Analyze map selection  
5. Civic knowledge foundation  
6. Location Intelligence Layer  
7. AI Co-Pilot (including agentive actions)

---

## Notes

- **No fantasy mapping** in this plan.
- **“Participatory urbanism”** = Plot’s category; not a feature name.
- **Bias / inclusive-language** is part of **Creation-time support** (content review), not a standalone feature.

---

# Detailed technical plan for each feature

**Shared setup (all AI features):**

- **LLM:** Use OpenAI API (or compatible). Backend only; never expose the API key to the frontend.
- **Env:** `OPENAI_API_KEY` in backend (Railway + local `.env`). Optional: `OPENAI_MODEL` (default `gpt-4o-mini`).
- **Backend:** New `backend/src/routes/ai.js` mounted at `app.use('/api/ai', aiRoutes)`. Centralize LLM in `backend/src/lib/llm.js` (e.g. `callOpenAI(system, user)`).
- **Rate limiting:** Stricter limit for `/api/ai/*` (e.g. 20 req/15 min per user).

---

## Feature 1 — Summarize a movement's ideas

**Goal:** Movement ID → AI returns themes, discussion questions, or one-page draft.

- **Data model:** None. Use existing Movement + Idea.
- **Backend:** `POST /api/ai/movements/:movementId/summarize` — body optional `{ outputType: 'themes'|'questions'|'draft' }`. Load movement + ideas (Prisma); build text block; LLM with system prompt for format; return `{ summary }` or `{ themes: [] }`.
- **Frontend:** Movement detail view: button "Summarize with AI" or tabs (Themes / Questions / Draft). Call API, show result in panel. Component: section in MovementView/MovementDetailsPage or `MovementSummaryPanel.jsx`.
- **Steps:** 1) Add `lib/llm.js` + `routes/ai.js` with summarize route. 2) Mount in server.js + rate limit. 3) Frontend button + API + result panel.

---

## Feature 2 — Creation-time support (tasks, review, suggestions)

**Goal:** During create/edit of idea or movement: suggest tasks, content review (inclusive language), or improvement suggestions.

- **Data model:** None. Task suggestions applied via existing `POST /api/ideas/:id/tasks`.
- **Backend:** `POST /api/ai/improve` — body `{ type: 'tasks'|'review'|'suggestions', entityType: 'movement'|'idea', text, context? }`. Three prompt branches: tasks → JSON array of `{ title, description }`; review → `{ score, summary, suggestions }`; suggestions → `{ suggestions: [] }`. Auth required.
- **Frontend:** In `CreateModal.jsx`, "Improve with AI" block: "Suggest tasks" / "Review content" / "Get suggestions." For new idea, store draft tasks in state; on success create idea then POST each task in onSuccess.
- **Steps:** 1) Add improve route with three prompts. 2) CreateModal: Improve block + wire "Add all tasks" after idea create.

---

## Feature 3 — Intelligent Idea Generation Assistant

**Goal:** Map click to add idea → AI suggests project types and starter descriptions from location context.

- **Data model:** None. Context = movement + nearby ideas (bbox query).
- **Backend:** `POST /api/ai/ideas/suggest` — body `{ movementId, latitude, longitude, address? }`. Load movement; query ideas in ~2km bbox; build context string; LLM returns JSON `{ suggestions: [{ title, description }] }`.
- **Frontend:** `CreateModal` when type idea + initialCoordinates: on open or "Get suggestions" call API; show suggestion cards; click one to fill title/description.
- **Steps:** 1) Add suggest route + bbox query. 2) CreateModal idea flow: call suggest, populate form from selection.

---

## Feature 4 — Analyze map selection

**Goal:** User draws region on map → AI summarizes movements/ideas in that area.

- **Data model:** None. Request sends bbox.
- **Backend:** `POST /api/ai/map/analyze` — body `{ bbox: [west, south, east, north] }`. Query movements/ideas in bbox; build text; LLM narrative summary; return `{ summary }`.
- **Frontend:** Map draw mode (e.g. Mapbox Draw or rectangle drag); "Draw area to analyze" → on finish POST bbox → show summary in panel/modal.
- **Steps:** 1) Add map/analyze route. 2) Map: draw mode + API call + result UI.

---

## Feature 5 — Civic knowledge foundation

**Goal:** Similar ideas/movements for reuse by Feature 2 and 7.

- **Data model:** Option A: none (tag + text/city overlap). Option B: embeddings table + pgvector.
- **Backend:** `GET /api/ai/similar?type=ideas|movements&id=:id&limit=5` or POST with `{ type, text, limit }`. Option A: Prisma query by tags, same city, text match. Option B: embedding search.
- **Frontend:** No dedicated UI; Feature 2 and 7 call this API.
- **Steps:** 1) Implement Option A similar endpoint. 2) Later: Option B if needed.

---

## Feature 6 — Location Intelligence Layer

**Goal:** Overlays, hover tooltips, underserved areas, impact viz.

- **Data model:** Optional cache table for census/need; else on-demand + short TTL cache.
- **Backend:** `GET /api/ai/location/tooltip?lat=&lng=` (tract stats); `GET /api/ai/location/overlays?bbox=` or `.../need?bbox=` (GeoJSON or need scores); `GET /api/ai/movements/:id/impact?metric=` (e.g. food desert %). Data: Census API or heuristics (e.g. "no movements within N km" = underserved).
- **Frontend:** Tooltip on map hover (throttled); overlay layer from overlays API; "Impact" section in movement view.
- **Steps:** 1) Tooltip endpoint + hover UI. 2) Underserved heuristic + overlay/panel. 3) One impact metric + backend + frontend.

---

## Feature 7 — AI Co-Pilot for Movement Leaders

**Goal:** Chat for organizers: drafts/summaries + agentive (create tasks, post update with confirm).

- **Data model:** Optional CoPilotConversation/CoPilotMessage; for agentive: add `MovementUpdate` (movementId, userId, content, createdAt) and `POST /api/movements/:id/updates`, or email path.
- **Backend:** `POST /api/ai/copilot` — body `{ movementId, message, history? }`. System prompt: co-pilot; when user asks to create tasks or post update, return structured intent: `{ message, intent?: { type: 'create_tasks', ideaId, tasks } | { type: 'post_update', content } }`. Load movement + recent ideas/comments for context.
- **Frontend:** Co-Pilot panel (slide-out) in movement view for owner/admin. Chat loop. On intent create_tasks: "Add these N tasks?" → Confirm → POST each to ideas API. On post_update: show draft → Confirm → POST updates or send email.
- **Steps:** 1) MovementUpdate + updates route (or email). 2) copilot route with intents. 3) Frontend panel + confirmation UI for intents.
