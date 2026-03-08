const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { callOpenAI } = require('../lib/llm');
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

module.exports = router;
