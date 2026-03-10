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

### 1. Summarize a movement’s ideas — *Next*

**What it does:** For a single movement, AI produces key themes, discussion questions, or a one-page draft from its ideas.

**AI modes:** **Generative** (summary/draft), **Assistive** (helps facilitators).

**Build order:** 4 *(next)*

---

### 2. Creation-time support for Ideas and Movements — ✅ Done

**What it does:** While users are creating or editing an idea or movement, AI helps in one place (e.g. “Improve with AI” / “AI review”):

- **Task list generation** — From the description, suggest actionable tasks (e.g. vacant lot → community garden tasks).
- **Content review** — Inclusive-language / bias check, clarity, tone.
- **Suggestions** — E.g. “Consider adding a timeline,” “Similar movements include X.”

**AI modes:** **Generative** (tasks, suggestions), **Assistive** (review, guidance).

**Build order:** 1 *(completed)*

---

### 3. Intelligent Idea Generation Assistant — ✅ Done

**What it does:** When a member with idea-creation permission hits "Suggest ideas" (or clicks the map to add an idea), AI suggests project types and starter descriptions that fit the movement and the place — physically, and where possible culturally, socially, economically, and historically.

**AI modes:** **Generative** (suggestions), **Assistive** (reduces friction at point of need).

**Build order:** 2 *(completed)*

**Inputs (high level):** Movement identity (name, description, tags, city/state, existing ideas); the place(s) tied to the request (click point and/or movement footprint); existing ideas in that area; and any geographic/civic context we can supply (see detailed plan).

---

### 4. Analyze map selection — ✅ Done

**What it does:** User draws a region on the map; AI summarizes movements and ideas in that area (“What’s going on here?”, themes, opportunities).

**AI modes:** **Generative** (analysis/summary), **Assistive** (discovery).

**Build order:** 3 *(completed)*

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

1. ~~Creation-time support (tasks, content review, suggestions)~~ — **Done**  
2. ~~Intelligent Idea Generation (suggest ideas for movement + place)~~ — **Done**  
3. ~~Analyze map selection~~ — **Done**  
4. **Summarize a movement's ideas** — **Next**  
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

**Goal:** When a user with idea-creation permission hits “Suggest ideas” (or clicks the map to add an idea), the AI suggests project types and starter descriptions that are relevant to the *movement* (its identity, tags, existing ideas) and to the *place* (physical and, where we can supply or infer it, cultural, social, economic, historical context).

---

### Inputs the AI receives

**1. Movement context (always)**  
- Identity: `name`, `description`, `city`, `state`, `tags`.  
- Scale/signal: member count, follower count (if we have it).  
- Existing ideas: for this movement, list of idea `title`, `description`, `city`, `state` (and tags if we have them).  
- Optional: recent updates, organization name/description — if we have them and they’re useful for tone and focus.

**2. Place context (what “the map” contributes)**  
- **If the user clicked a point:** `latitude`, `longitude`; optional reverse-geocoded **address** and **neighborhood/place name** (e.g. from Mapbox Geocoding) so the AI can reason about “where” in human terms.  
- **If “Suggest ideas” without a click:** we still have the movement’s **city/state** and the **geographic footprint of its existing ideas** (e.g. bbox or list of city/state of each idea). So “place” = the movement’s current map, not a single pin.

**3. Existing ideas in the area (to align and differentiate)**  
- Ideas in the *same movement* that are **near** the point (e.g. within ~2 km bbox) or in the same city/neighborhood: title, short description, so the AI can suggest things that **complement** rather than duplicate, and that fit the movement’s existing portfolio.

**4. Optional: other movements’ ideas in the area**  
- Same bbox or same city: titles (and maybe one-line descriptions) so the AI can suggest ideas that are relevant but distinct from what others are already doing.

So in all cases the AI sees: *who the movement is* (1), *where we’re focusing* (2), and *what’s already there* (3, and optionally 4).

---

### Geographic and civic data: what helps interpret the movement’s map

We want the AI to interpret place through a **physical** lens and, where possible, **cultural, social, economic, and historical** lenses so suggestions feel grounded and relevant.

**What we can use today (no new data pipelines):**  
- **Movement + ideas:** name, description, tags, city, state, existing idea titles/descriptions and their locations.  
- **Reverse geocode (Mapbox):** for a click point, address and neighborhood/place name.  
- **Our own DB:** ideas (and movements) in a bbox or same city — so “this movement already has ideas A, B here” and “other movements have C, D here.”  
- **LLM general knowledge:** the model can reason about “New Orleans, Mid-City,” “food justice,” “community garden” and suggest culturally and contextually relevant ideas even without structured civic data.

**What would strengthen suggestions (later; e.g. Feature 6 — Location Intelligence):**  
- **Physical:** Zoning, land use, parcels (if we add a data source).  
- **Economic / demographic:** Census tract (or block group) stats: income, tenure, vacancy, household composition — so we can say “lower-income, renter-heavy area” or “food desert” in the prompt.  
- **Social / cultural:** No standard single API; we could add city/county open data (e.g. “cultural districts,” “historic neighborhoods”) or nonprofit datasets later.  
- **Historical:** Same — open data or narrative summaries if we ever add them.

**Practical v1:**  
- **Required:** Movement (1) + place (2) + existing ideas in area (3).  
- **In the prompt:** Include reverse-geocoded **address and neighborhood** for the click point (or “Movement footprint: city X, ideas in neighborhoods A, B, C”).  
- **Cultural/social/economic/historical:** Rely on the LLM’s general knowledge plus the movement’s own tags and descriptions; optionally add one or two Census or open-data fields later (e.g. “tract median income”) when we have a Location Intelligence layer.

---

### Implementation (unchanged)

- **Data model:** None. Context = movement + nearby ideas (bbox query) + reverse geocode for click point.
- **Backend:** `POST /api/ai/ideas/suggest` — body `{ movementId, latitude?, longitude?, address?, neighborhood? }`. If no lat/lng, use movement’s city/state + bbox of its ideas. Load movement and its ideas; query ideas in ~2km bbox (and optionally other movements’ ideas in bbox); reverse-geocode if lat/lng provided; build context string; LLM returns JSON `{ suggestions: [{ title, description }] }`.
- **Frontend:** Movement view: “Suggest ideas” button; or CreateModal when type idea + initialCoordinates: on open or “Get suggestions” call API; show suggestion cards; click one to fill title/description.
- **Steps:** 1) Add suggest route: load movement + ideas, bbox query, optional reverse geocode, build prompt with inputs above. 2) Frontend: “Suggest ideas” + CreateModal idea flow, populate form from selection.

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

**How it works technically / when a user needs it:**
- **Technically:** Backend calls external APIs (e.g. Census) or runs heuristics (e.g. “no movements within N km”) to attach place-based data to lat/lng or bbox. Results are cached (optional table or short TTL). Frontend requests tooltips on hover (throttled) and overlay GeoJSON for the current view; impact is computed per movement (e.g. % of food desert area covered by its ideas).
- **When a user needs it:** When they’re deciding *where* to focus (e.g. “Where is need highest?”), evaluating *impact* (“How much of the city’s need does our movement cover?”), or exploring the map and wanting quick *place context* (income, tenure, organizations) without leaving the map. It answers “what’s true about this place?” rather than “what’s similar to this idea?”

---

## Feature 7 — AI Co-Pilot for Movement Leaders

**Goal:** Chat for organizers: drafts/summaries + agentive (create tasks, post update with confirm).

- **Data model:** Optional CoPilotConversation/CoPilotMessage; for agentive: add `MovementUpdate` (movementId, userId, content, createdAt) and `POST /api/movements/:id/updates`, or email path.
- **Backend:** `POST /api/ai/copilot` — body `{ movementId, message, history? }`. System prompt: co-pilot; when user asks to create tasks or post update, return structured intent: `{ message, intent?: { type: 'create_tasks', ideaId, tasks } | { type: 'post_update', content } }`. Load movement + recent ideas/comments for context.
- **Frontend:** Co-Pilot panel (slide-out) in movement view for owner/admin. Chat loop. On intent create_tasks: "Add these N tasks?" → Confirm → POST each to ideas API. On post_update: show draft → Confirm → POST updates or send email.
- **Steps:** 1) MovementUpdate + updates route (or email). 2) copilot route with intents. 3) Frontend panel + confirmation UI for intents.
