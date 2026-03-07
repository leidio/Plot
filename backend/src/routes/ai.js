const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { callOpenAI } = require('../lib/llm');

const router = express.Router();

const TITLE_CONTEXT = `When a title is provided, treat it as the intended topic. Your feedback and edits should align with the title. If the description is unrelated, nonsensical, or contradicts the title, say so and suggest how to bring the description in line with the title (or suggest revising the title if that fits better).`;

const IMPROVE_SYSTEM = {
  rewrite: `You are an editor for a civic engagement platform. Rewrite the user's description for clarity and impact. Keep the same meaning and tone; make it clearer and more engaging. ${TITLE_CONTEXT} If the description does not match the title, rewrite so it addresses the title's topic, or note the mismatch in one brief sentence at the start (then give the best rewrite you can). Return only the rewritten text, no preamble unless you are noting a title/description mismatch.`,
  tone: `You are an editor for a civic engagement platform. Rewrite the user's text with a more professional, warm, and engaging tone. Keep the same meaning and content; only adjust tone so it feels more inviting and clear. ${TITLE_CONTEXT} Return only the rewritten text, no preamble.`,
  review: `You are an editor focused on inclusive language and bias. Review the text and return a JSON object with: "score" (1-5, 5 being most inclusive), "summary" (one sentence), "suggestions" (array of strings with specific improvements). ${TITLE_CONTEXT} If the description is unrelated to the title, include a suggestion like "Consider aligning the description with the idea title" and lower the score if the mismatch is severe. Be constructive and brief.`,
  suggestions: `You are a civic project advisor. Suggest 2-4 concrete improvements to strengthen this project description (e.g. add a timeline, clarify outcomes, add location detail, consider partners). ${TITLE_CONTEXT} If the description does not match the title, your first suggestion should be to align the description with the title's topic. Return a JSON object with: "suggestions" (array of strings).`,
  tasks: `You are a project coordinator. Given this civic project or idea (title and description), output a JSON object with a "tasks" array. Each task has "title" (string) and optional "description" (string). Base tasks on both the title and the description; if they conflict, prefer the title as the intended topic. Provide 5-10 actionable tasks that would help move this idea forward. Be specific and practical.`,
  custom: `You are a helpful assistant for a civic engagement platform. The user is writing a movement or idea and has provided a title and description. ${TITLE_CONTEXT} Respond with exactly what they need: if they want revised text, return only the revised text; if they want advice, return clear, actionable advice. Be concise.`
};

function buildUserMessage(type, text, title, customPrompt) {
  const prefix = title ? `Title: ${title}\n\nDescription:\n` : 'Description:\n';
  const content = text || '(No content yet)';
  if (type === 'custom' && customPrompt) {
    return `${prefix}${content}\n\nUser request: ${customPrompt}`;
  }
  return `${prefix}${content}`;
}

router.post('/improve', authenticateToken, async (req, res) => {
  try {
    const { type, entityType, text, title, customPrompt } = req.body;
    const allowed = ['rewrite', 'tone', 'review', 'suggestions', 'tasks', 'custom'];
    if (!type || !allowed.includes(type)) {
      return res.status(400).json({ error: { message: 'Invalid type. Use: rewrite, tone, review, suggestions, tasks, custom.' } });
    }
    if (!entityType || !['movement', 'idea'].includes(entityType)) {
      return res.status(400).json({ error: { message: 'entityType must be movement or idea.' } });
    }
    if (type === 'custom' && !customPrompt?.trim()) {
      return res.status(400).json({ error: { message: 'customPrompt required for type custom.' } });
    }

    const systemPrompt = IMPROVE_SYSTEM[type];
    const userMessage = buildUserMessage(type, text, title, customPrompt);

    const wantsJson = ['review', 'suggestions', 'tasks'].includes(type);
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

    return res.json({ result: raw });
  } catch (err) {
    console.error('AI improve error:', err);
    const message = err.message || 'AI request failed';
    const status = message.includes('OPENAI_API_KEY') ? 503 : 500;
    return res.status(status).json({ error: { message } });
  }
});

module.exports = router;
