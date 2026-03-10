const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { callOpenAI, callOpenAIChat } = require('../lib/llm');
const { getSimilarMovements, getSimilarIdeas } = require('../lib/civicKnowledge');
const prisma = require('../lib/prisma');

const router = express.Router();

const TITLE_CONTEXT = `When a title is provided, treat it as the intended topic. Your feedback and edits should align with the title. If the description is unrelated, nonsensical, or contradicts the title, say so and suggest how to bring the description in line with the title (or suggest revising the title if that fits better).`;

const IMPROVE_SYSTEM = {
  rewrite: `You are an editor for a civic engagement platform. Rewrite the user's description for clarity and impact. Keep the same meaning and tone; make it clearer and more engaging. ${TITLE_CONTEXT} If the description does not match the title, rewrite so it addresses the title's topic, or note the mismatch in one brief sentence at the start (then give the best rewrite you can). Return only the rewritten text, no preamble unless you are noting a title/description mismatch.`,
  tone: `You are an editor for a civic engagement platform. Rewrite the user's text with a more professional, warm, and engaging tone. Keep the same meaning and content; only adjust tone so it feels more inviting and clear. ${TITLE_CONTEXT} Return only the rewritten text, no preamble.`,
  review: `You are an editor focused on inclusive language and bias. Review the text and return a JSON object with: "score" (1-5, 5 being most inclusive), "summary" (one sentence), "suggestions" (array of strings with specific improvements). ${TITLE_CONTEXT} If the description is unrelated to the title, include a suggestion like "Consider aligning the description with the idea title" and lower the score if the mismatch is severe. Be constructive and brief.`,
  suggestions: `You are a civic project advisor. Suggest 2-4 concrete improvements to strengthen this project description (e.g. add a timeline, clarify outcomes, add location detail, consider partners). ${TITLE_CONTEXT} If the description does not match the title, your first suggestion should be to align the description with the title's topic. Return a JSON object with: "suggestions" (array of strings).`,
  tasks: `You are a project coordinator. Given this civic project or idea (title and description), output a JSON object with a "tasks" array. Each task has "title" (string) and optional "description" (string). Base tasks on both the title and the description; if they conflict, prefer the title as the intended topic. Provide 5-10 actionable tasks that would help move this idea forward. Be specific and practical.`,
  suggest_tags: `You are a civic engagement platform advisor. Given a movement's name, description, and location (city/region), suggest 5-10 relevant tags that would help others discover and filter this movement. Consider the movement's topic, goals, and the location (e.g. local issues, regional context). Tags should be lowercase, short (one or two words), and comma-separated in spirit (e.g. sustainability, community, food justice, local). Return a JSON object with a "tags" array of strings.`,
  custom: `You are a helpful assistant for a civic engagement platform. The user is writing a movement or idea and has provided a title and description. ${TITLE_CONTEXT} Respond with exactly what they need: if they want revised text, return only the revised text; if they want advice, return clear, actionable advice. Be concise.`
};

function buildUserMessage(type, text, title, customPrompt, location) {
  const prefix = title ? `Title: ${title}\n\nDescription:\n` : 'Description:\n';
  const content = text || '(No content yet)';
  if (type === 'custom' && customPrompt) {
    return `${prefix}${content}\n\nUser request: ${customPrompt}`;
  }
  if (type === 'suggest_tags' && location) {
    return `${prefix}${content}\n\nLocation: ${location}`;
  }
  return `${prefix}${content}`;
}

router.post('/improve', authenticateToken, async (req, res) => {
  try {
    const { type, entityType, text, title, customPrompt, location } = req.body;
    const allowed = ['rewrite', 'tone', 'review', 'suggestions', 'tasks', 'suggest_tags', 'custom'];
    if (!type || !allowed.includes(type)) {
      return res.status(400).json({ error: { message: 'Invalid type. Use: rewrite, tone, review, suggestions, tasks, suggest_tags, custom.' } });
    }
    if (!entityType || !['movement', 'idea'].includes(entityType)) {
      return res.status(400).json({ error: { message: 'entityType must be movement or idea.' } });
    }
    if (type === 'custom' && !customPrompt?.trim()) {
      return res.status(400).json({ error: { message: 'customPrompt required for type custom.' } });
    }
    if (type === 'suggest_tags' && entityType !== 'movement') {
      return res.status(400).json({ error: { message: 'suggest_tags is only valid for entityType movement.' } });
    }

    const systemPrompt = IMPROVE_SYSTEM[type];
    const userMessage = buildUserMessage(type, text, title, customPrompt, location);

    const wantsJson = ['review', 'suggestions', 'tasks', 'suggest_tags'].includes(type);
    const raw = await callOpenAI(systemPrompt, userMessage, { json: wantsJson });

    if (type === 'rewrite' || type === 'tone' || type === 'custom') {
      return res.json({ result: raw.trim() });
    }

    const parsed = JSON.parse(raw);
    if (type === 'review') {
      return res.json({
        score: parsed.score,
        summary: parsed.summary,
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
      });
    }
    if (type === 'suggestions') {
      return res.json({
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
      });
    }
    if (type === 'tasks') {
      return res.json({
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
      });
    }
    if (type === 'suggest_tags') {
      const tags = Array.isArray(parsed.tags) ? parsed.tags : [];
      return res.json({ tags });
    }

    return res.json({ result: raw });
  } catch (err) {
    console.error('AI improve error:', err);
    const message = err.message || 'AI request failed';
    const status = message.includes('OPENAI_API_KEY') ? 503 : 500;
    return res.status(status).json({ error: { message } });
  }
});

/**
 * Deep interpretation of a movement's area and surroundings to suggest ideas.
 * POST /api/ai/suggest-ideas  body: { movementId }
 */
router.post('/suggest-ideas', authenticateToken, async (req, res) => {
  try {
    const { movementId } = req.body;
    if (!movementId) {
      return res.status(400).json({ error: { message: 'movementId is required' } });
    }

    const movement = await prisma.movement.findUnique({
      where: { id: movementId },
      select: {
        id: true,
        name: true,
        description: true,
        city: true,
        state: true,
        country: true,
        latitude: true,
        longitude: true,
        tags: true,
        boundary: true,
        boundaryBbox: true
      }
    });

    if (!movement) {
      return res.status(404).json({ error: { message: 'Movement not found' } });
    }

    const hasBoundary = movement.boundary?.coordinates?.length > 0;
    const locationContext = hasBoundary
      ? `The movement has a defined geographic boundary (polygon) centered near ${movement.city}, ${movement.state}. Consider the area inside this boundary and its immediate surroundings.`
      : `The movement is centered at ${movement.city}, ${movement.state} (lat/lng: ${movement.latitude}, ${movement.longitude}). Consider this location and its surroundings—neighborhoods, local issues, and regional context.`;

    const systemPrompt = `You are a civic engagement strategist. Your task is to do a deep interpretation of a movement's geographic area and its surroundings, then write a brief area summary and propose concrete ideas that would fit the movement.

Guidelines:
- Base your interpretation on the movement's name, description, tags, and especially the PLACE: ${locationContext}
- Think about local needs, assets, demographics, and issues that matter in that area.
- First write a short "areaSummary" (2–4 sentences) that captures what this place is like and why it matters for this movement—e.g. character of the area, key opportunities or challenges, or how the location connects to the movement's goals.
- Then suggest 5–8 ideas. Each idea has a short "title" (clear, concrete) and a "description" (2–4 sentences explaining the idea and why it fits this movement and place).
- Vary the types of ideas (e.g. events, projects, campaigns, spaces, partnerships).
- Return a JSON object with: "areaSummary" (string) and "suggestions" (array). Each suggestion: { "title": string, "description": string }`;

    const userMessage = `Movement: ${movement.name}
Description: ${movement.description}
Location: ${movement.city}, ${movement.state}${movement.country ? `, ${movement.country}` : ''}
Tags: ${(movement.tags || []).join(', ') || 'none'}
${hasBoundary ? 'This movement has a drawn boundary (specific geographic area).' : ''}

Provide an area summary and 5–8 ideas. Return JSON: { "areaSummary": "2-4 sentences about the area...", "suggestions": [ { "title": "...", "description": "..." }, ... ] }`;

    const raw = await callOpenAI(systemPrompt, userMessage, { json: true });
    const parsed = JSON.parse(raw);
    const areaSummary =
      typeof parsed.areaSummary === 'string' ? parsed.areaSummary.trim() : '';
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .filter(s => s && typeof s.title === 'string' && typeof s.description === 'string')
          .map(s => ({ title: s.title.trim(), description: s.description.trim() }))
      : [];

    return res.json({ areaSummary, suggestions });
  } catch (err) {
    console.error('AI suggest-ideas error:', err);
    const message = err.message || 'Failed to suggest ideas';
    const status = message.includes('OPENAI_API_KEY') ? 503 : 500;
    return res.status(status).json({ error: { message } });
  }
});

/**
 * Intelligence layer: analyze a map selection and/or generate movements from a prompt.
 * Threads are persisted per user.
 * POST /api/ai/intelligence/threads                    body: { selection?, title? }
 * GET  /api/ai/intelligence/threads
 * GET  /api/ai/intelligence/threads/:threadId
 * POST /api/ai/intelligence                            body: { prompt, selection?, threadId? }
 */
function getCentroidFromSelection(selection) {
  if (!selection || !selection.coordinates) return null;
  if (selection.type === 'Point' && Array.isArray(selection.coordinates) && selection.coordinates.length >= 2) {
    return { lng: selection.coordinates[0], lat: selection.coordinates[1] };
  }
  if (selection.type === 'Polygon' && Array.isArray(selection.coordinates) && selection.coordinates[0]?.length) {
    const ring = selection.coordinates[0];
    let sumLng = 0, sumLat = 0, n = 0;
    for (const p of ring) {
      const [lng, lat] = Array.isArray(p) ? p : [p?.lng ?? p?.x, p?.lat ?? p?.y];
      if (typeof lng === 'number' && typeof lat === 'number') {
        sumLng += lng; sumLat += lat; n++;
      }
    }
    if (n === 0) return null;
    return { lng: sumLng / n, lat: sumLat / n };
  }
  return null;
}

function sanitizeIntelligenceResponse(parsed) {
  const areaSummary = typeof parsed.areaSummary === 'string' ? parsed.areaSummary.trim() : null;
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions
        .filter((s) => s && typeof s.title === 'string' && typeof s.description === 'string')
        .map((s) => ({ title: s.title.trim(), description: s.description.trim() }))
    : null;
  const movements = Array.isArray(parsed.movements)
    ? parsed.movements
        .filter((m) => m && typeof m.name === 'string')
        .map((m) => ({
          name: String(m.name).trim(),
          description: typeof m.description === 'string' ? m.description.trim() : '',
          city: typeof m.city === 'string' ? m.city.trim() : '',
          state: typeof m.state === 'string' ? m.state.trim() : ''
        }))
    : null;
  const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : null;

  return {
    ...(areaSummary && { areaSummary }),
    ...(suggestions && suggestions.length > 0 && { suggestions }),
    ...(movements && movements.length > 0 && { movements }),
    ...(answer && { answer })
  };
}

function formatThreadHistory(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const lines = [];
  for (const message of messages) {
    lines.push(`User: ${message.prompt}`);
    lines.push(`Assistant: ${JSON.stringify(message.response)}`);
  }
  return lines.join('\n');
}

function buildThreadTitle(prompt, fallback = 'Intelligence thread') {
  if (!prompt || typeof prompt !== 'string') return fallback;
  const trimmed = prompt.trim().replace(/\s+/g, ' ');
  if (!trimmed) return fallback;
  return trimmed.slice(0, 64);
}

router.post('/intelligence/threads', authenticateToken, async (req, res) => {
  try {
    const { selection, title } = req.body || {};
    const thread = await prisma.intelligenceThread.create({
      data: {
        userId: req.user.id,
        selection: selection || null,
        title: buildThreadTitle(title, 'New intelligence session')
      }
    });
    return res.status(201).json({ thread });
  } catch (err) {
    console.error('Create intelligence thread error:', err);
    return res.status(500).json({ error: { message: 'Failed to create intelligence thread' } });
  }
});

router.get('/intelligence/threads', authenticateToken, async (req, res) => {
  try {
    const threads = await prisma.intelligenceThread.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      include: {
        _count: { select: { messages: true } },
        messages: { take: 1, orderBy: { createdAt: 'desc' }, select: { prompt: true, createdAt: true } }
      }
    });
    const payload = threads.map((thread) => ({
      id: thread.id,
      title: thread.title || 'Untitled thread',
      selection: thread.selection,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      messageCount: thread._count.messages,
      lastPrompt: thread.messages[0]?.prompt || null,
      lastMessageAt: thread.messages[0]?.createdAt || null
    }));
    return res.json({ threads: payload });
  } catch (err) {
    console.error('List intelligence threads error:', err);
    return res.status(500).json({ error: { message: 'Failed to load intelligence threads' } });
  }
});

router.get('/intelligence/threads/:threadId', authenticateToken, async (req, res) => {
  try {
    const { threadId } = req.params;
    const thread = await prisma.intelligenceThread.findFirst({
      where: { id: threadId, userId: req.user.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } }
    });
    if (!thread) return res.status(404).json({ error: { message: 'Thread not found' } });
    return res.json({ thread });
  } catch (err) {
    console.error('Get intelligence thread error:', err);
    return res.status(500).json({ error: { message: 'Failed to load thread' } });
  }
});

router.post('/intelligence', authenticateToken, async (req, res) => {
  try {
    const { prompt, selection, threadId } = req.body;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: { message: 'prompt is required' } });
    }

    let thread = null;
    if (threadId) {
      thread = await prisma.intelligenceThread.findFirst({
        where: { id: threadId, userId: req.user.id }
      });
      if (!thread) {
        return res.status(404).json({ error: { message: 'Thread not found' } });
      }
    } else {
      thread = await prisma.intelligenceThread.create({
        data: {
          userId: req.user.id,
          selection: selection || null,
          title: buildThreadTitle(prompt, 'New intelligence session')
        }
      });
    }

    if (selection && !thread.selection) {
      thread = await prisma.intelligenceThread.update({
        where: { id: thread.id },
        data: { selection }
      });
    }

    const historyMessages = await prisma.intelligenceMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'desc' },
      take: 8
    });
    const threadHistory = formatThreadHistory(historyMessages.reverse());
    const effectiveSelection = selection || thread.selection;

    const centroid = effectiveSelection ? getCentroidFromSelection(effectiveSelection) : null;
    const selectionContext = centroid
      ? `The user has selected an area on the map. Center of selection: latitude ${centroid.lat.toFixed(4)}, longitude ${centroid.lng.toFixed(4)}. ${effectiveSelection.type === 'Polygon' ? 'The selection is a drawn polygon (specific geographic area).' : 'The selection is a single point.'}`
      : 'The user has not selected an area; they may be asking a general question or to generate movements from description only.';

    const systemPrompt = `You are Plot's Intelligence: an AI that helps users analyze places on a map and generate civic movements.

${selectionContext}

The user's prompt: "${prompt.trim()}"

Respond in JSON with any of these fields as appropriate:
- "areaSummary" (string): If there is a map selection, provide a 2–4 sentence interpretation of that area (character, opportunities, challenges). Omit if no selection or not relevant.
- "suggestions" (array): If analyzing an area or the user wants ideas, provide 3–6 items. Each: { "title": string, "description": string }. Omit if not relevant.
- "movements" (array): If the user wants to generate or suggest movements, provide 2–5 items. Each: { "name": string, "description": string, "city": string, "state": string }. Omit if not relevant.
- "answer" (string): A short direct answer when the prompt is a question that doesn't need areaSummary/suggestions/movements.

Prioritize the user's intent: analyze selection, suggest ideas, or generate movements.
Use prior thread context when relevant, but prefer the latest user prompt if there is conflict.
Return only the JSON object.`;

    const contextualPrompt = threadHistory
      ? `Thread history:\n${threadHistory}\n\nLatest user prompt:\n${prompt.trim()}`
      : prompt.trim();

    const raw = await callOpenAI(systemPrompt, contextualPrompt, { json: true });
    const parsed = JSON.parse(raw);
    const responsePayload = sanitizeIntelligenceResponse(parsed);

    const message = await prisma.intelligenceMessage.create({
      data: {
        threadId: thread.id,
        prompt: prompt.trim(),
        response: responsePayload
      }
    });

    await prisma.intelligenceThread.update({
      where: { id: thread.id },
      data: {
        title: thread.title || buildThreadTitle(prompt, 'Intelligence thread')
      }
    });

    return res.json({
      threadId: thread.id,
      threadMessage: {
        id: message.id,
        prompt: message.prompt,
        response: message.response,
        createdAt: message.createdAt
      },
      ...responsePayload
    });
  } catch (err) {
    console.error('AI intelligence error:', err);
    const message = err.message || 'Intelligence request failed';
    const status = message.includes('OPENAI_API_KEY') ? 503 : 500;
    return res.status(status).json({ error: { message } });
  }
});

/**
 * Civic knowledge: similar ideas or movements (no UI; used by AI to enrich context).
 * GET /api/ai/similar?type=ideas|movements&id=:id&limit=5
 */
router.get('/similar', authenticateToken, async (req, res) => {
  try {
    const { type, id, limit } = req.query;
    if (!type || !id) {
      return res.status(400).json({ error: { message: 'type and id are required' } });
    }
    if (type !== 'ideas' && type !== 'movements') {
      return res.status(400).json({ error: { message: 'type must be ideas or movements' } });
    }

    const items = type === 'movements'
      ? await getSimilarMovements(prisma, id, limit)
      : await getSimilarIdeas(prisma, id, limit);

    return res.json({ items });
  } catch (err) {
    console.error('AI similar error:', err);
    return res.status(500).json({ error: { message: err.message || 'Failed to fetch similar items' } });
  }
});

/**
 * Co-Pilot: chat assistant for movement/idea creators. Context-aware (movement + ideas).
 * POST /api/ai/copilot  body: { movementId, message, history?, ideaId? }
 */
router.post('/copilot', authenticateToken, async (req, res) => {
  try {
    const { movementId, message, history = [], ideaId } = req.body;
    if (!movementId || !message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: { message: 'movementId and message are required' } });
    }

    const movement = await prisma.movement.findFirst({
      where: { id: movementId },
      include: {
        ideas: {
          take: 30,
          orderBy: { updatedAt: 'desc' },
          select: { id: true, title: true, description: true, status: true }
        }
      }
    });

    if (!movement) {
      return res.status(404).json({ error: { message: 'Movement not found' } });
    }

    const isMovementOwner = movement.ownerId === req.user.id;
    let ideaForContext = null;
    if (ideaId) {
      ideaForContext = await prisma.idea.findFirst({
        where: { id: ideaId, movementId },
        select: { id: true, title: true, description: true, status: true, creatorId: true }
      });
    }
    const isIdeaCreator = ideaForContext && ideaForContext.creatorId === req.user.id;
    if (!isMovementOwner && !isIdeaCreator) {
      return res.status(403).json({ error: { message: 'Only the movement or idea creator can use Co-Pilot here' } });
    }

    let ideaContext = '';
    if (ideaForContext) {
      ideaContext = `\nCurrent idea in focus:\n- Title: ${ideaForContext.title}\n- Description: ${(ideaForContext.description || '').slice(0, 500)}${(ideaForContext.description && ideaForContext.description.length > 500) ? '...' : ''}`;
    }

    const ideasBlob = movement.ideas.length
      ? movement.ideas.map(i => `- ${i.title}: ${(i.description || '').slice(0, 200)}${(i.description && i.description.length > 200) ? '...' : ''}`).join('\n')
      : '(No ideas yet)';

    let civicContext = '';
    try {
      const [similarMovements, similarIdeas] = await Promise.all([
        getSimilarMovements(prisma, movement.id, 4),
        ideaForContext ? getSimilarIdeas(prisma, ideaForContext.id, 3) : Promise.resolve([])
      ]);
      if (similarMovements.length > 0) {
        civicContext += `\nSimilar movements elsewhere on Plot (for reference):\n${similarMovements.map(m => `- ${m.name} (${m.city}, ${m.state}): ${(m.description || '').slice(0, 150)}${(m.description && m.description.length > 150) ? '...' : ''}`).join('\n')}`;
      }
      if (similarIdeas.length > 0) {
        civicContext += `\nSimilar ideas elsewhere on Plot:\n${similarIdeas.map(i => `- ${i.title} (${i.movementName || ''}): ${(i.description || '').slice(0, 120)}${(i.description && i.description.length > 120) ? '...' : ''}`).join('\n')}`;
      }
      if (civicContext) civicContext = `\nCivic knowledge (use to suggest what has worked elsewhere):${civicContext}`;
    } catch (_) {
      // Non-fatal; Co-Pilot works without civic context
    }

    const systemPrompt = `You are Plot's Co-Pilot: a helpful assistant for the organizers of the movement "${movement.name}".

Movement: ${movement.name}
Location: ${movement.city}, ${movement.state}
Description: ${(movement.description || '').slice(0, 600)}${(movement.description && movement.description.length > 600) ? '...' : ''}

Ideas in this movement:
${ideasBlob}
${ideaContext}
${civicContext}

Help with drafting updates, summarizing comments, suggesting next steps, or answering questions about this movement and its ideas. When relevant, use the "Similar movements/ideas elsewhere on Plot" context to suggest what has worked elsewhere. Be concise and practical. If the user asks to create tasks or post an update, acknowledge it and suggest they use the app's existing actions for now (we'll add one-click actions later).`;

    const historyMessages = Array.isArray(history)
      ? history
          .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .slice(-12)
          .map(m => ({ role: m.role, content: m.content }))
      : [];

    const messages = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: message.trim() }
    ];

    const reply = await callOpenAIChat(messages);

    return res.json({ message: reply });
  } catch (err) {
    console.error('AI copilot error:', err);
    const errMessage = err.message || 'Co-Pilot request failed';
    const status = errMessage.includes('OPENAI_API_KEY') ? 503 : 500;
    return res.status(status).json({ error: { message: errMessage } });
  }
});

module.exports = router;
