import React, { useState, useRef, useEffect } from 'react';
import { X, Send, MessageCircle } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

/**
 * Co-Pilot: FAB + slide-out chat panel for movement/idea creators.
 * Shows only when user is movement owner or idea creator (parent controls visibility).
 */
const CoPilot = ({ movementId, ideaId = null, movementName = 'Movement', apiCall }) => {
  const { isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (open) scrollToBottom();
  }, [open, messages]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !movementId || loading) return;

    setInput('');
    setError(null);
    const userMsg = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const payload = { movementId, message: text, history };
      if (ideaId) payload.ideaId = ideaId;

      const res = await apiCall('post', '/ai/copilot', payload);
      const reply = res.data?.message ?? 'No response.';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      const errMessage = err.response?.data?.error?.message || err.message || 'Co-Pilot request failed';
      setError(errMessage);
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${errMessage}` }]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const panelBg = isDark ? 'bg-gray-900' : 'bg-white';
  const panelBorder = isDark ? 'border-gray-700' : 'border-gray-200';
  const inputBg = isDark ? 'bg-gray-800 border-gray-600' : 'bg-gray-50 border-gray-200';
  const textColor = isDark ? 'text-gray-100' : 'text-gray-900';
  const mutedColor = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <>
      {/* FAB */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-content shadow-lg transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        aria-label="Open Co-Pilot"
      >
        <MessageCircle className="h-6 w-6" />
      </button>

      {/* Slide-out panel */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          aria-modal
          aria-labelledby="copilot-title"
        >
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
            role="button"
            tabIndex={0}
            aria-label="Close Co-Pilot"
          />
          <div
            className={`relative flex w-full max-w-md flex-col ${panelBg} ${panelBorder} border-l shadow-xl`}
          >
            <div className={`flex items-center justify-between border-b ${panelBorder} px-4 py-3`}>
              <h2 id="copilot-title" className={`font-semibold ${textColor}`}>
                Co-Pilot {movementName ? `· ${movementName}` : ''}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={`rounded p-1 ${mutedColor} hover:bg-gray-700/50 hover:text-gray-200`}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[60vh]">
              {messages.length === 0 && (
                <p className={mutedColor}>
                  Ask for help drafting updates, summarizing comments, or next steps for this
                  {ideaId ? ' idea' : ' movement'}.
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      m.role === 'user'
                        ? 'bg-primary text-primary-content'
                        : isDark
                          ? 'bg-gray-800 text-gray-100'
                          : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div
                    className={`rounded-lg px-3 py-2 text-sm ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}
                  >
                    …
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {error && (
              <div className="px-4 py-1 text-sm text-red-500" role="alert">
                {error}
              </div>
            )}

            <div className={`border-t ${panelBorder} p-3`}>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Co-Pilot…"
                  disabled={loading}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm ${inputBg} ${textColor} placeholder:${mutedColor} focus:outline-none focus:ring-2 focus:ring-primary`}
                  aria-label="Message"
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className="rounded-lg bg-primary px-3 py-2 text-primary-content disabled:opacity-50 hover:opacity-90"
                  aria-label="Send"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CoPilot;
