'use client';

// Floating feedback widget pinned to the bottom-right of every dashboard
// screen. Opens a short AI conversation (in the StorieD voice) that asks how
// the operator is getting on and gathers issues. "Send to the team" compiles
// the chat and emails it to team@thesetupcrew.co.uk via a Make webhook.
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const RESERVED = ['new', 'admin'];
const GREETING =
  "Hi, I'm here on behalf of the StorieD team. I'd love to hear how you're getting on. There are three quick things I'll ask about: what's working well for you, anything that's giving you trouble, and any features you'd like to see. Pick one to start, or just tell me what's on your mind.";

// Tappable starters so the operator can see exactly what we're asking and jump
// straight in. Each one kicks off that thread; the assistant takes it from there.
const SUGGESTIONS = [
  { label: '👍 What’s working well', text: "I'd like to share what's working well for me." },
  { label: '🐛 I’m having an issue', text: "I'm having an issue I'd like to flag." },
  { label: '💡 A feature I’d like', text: "There's a feature or change I'd like to see." },
];

function slugFromPath(path: string): string | null {
  const m = path.match(/^\/dashboard\/([^/]+)/);
  if (!m) return null;
  return RESERVED.includes(m[1]) ? null : m[1];
}

export function FeedbackWidget() {
  const pathname = usePathname();
  const citySlug = slugFromPath(pathname);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: GREETING },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, thinking]);

  async function sendMessage(textArg?: string) {
    const text = (textArg ?? input).trim();
    if (!text || thinking || sending) return;
    setError(null);
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setThinking(true);
    try {
      const r = await fetch('/api/feedback/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, citySlug }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Something went wrong.');
      setMessages((m) => [...m, { role: 'assistant', content: j.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setThinking(false);
    }
  }

  async function sendToTeam() {
    if (sending || sent) return;
    if (!messages.some((m) => m.role === 'user')) {
      setError('Share a little feedback first, then send it over.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      const r = await fetch('/api/feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, citySlug }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Could not send. Please try again.');
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send. Please try again.');
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setMessages([{ role: 'assistant', content: GREETING }]);
    setInput('');
    setSent(false);
    setError(null);
  }

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-primary shadow-lg hover:bg-accent-light transition"
          aria-label="Share feedback"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 1 1 16.1-3.8Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Feedback
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl bg-cream shadow-2xl ring-1 ring-black/10">
          <header className="flex items-center justify-between bg-primary px-4 py-3 text-cream">
            <div>
              <p className="font-display text-lg leading-none">
                <span className="font-semibold">Storie</span>
                <span className="text-accent font-semibold">D</span>
                <span className="ml-2 align-middle text-xs font-sans text-cream/70">
                  Feedback
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-cream/70 hover:text-cream transition"
              aria-label="Close feedback"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          {sent ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-visited text-cream">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="font-display text-xl text-primary">Thank you</p>
              <p className="text-sm text-primary/70">
                That has gone to the team. We read every word.
              </p>
              <button
                type="button"
                onClick={reset}
                className="mt-2 text-sm font-semibold text-primary underline hover:text-primary-light transition"
              >
                Share something else
              </button>
            </div>
          ) : (
            <>
              <div
                ref={scrollRef}
                className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
                style={{ maxHeight: '50vh', minHeight: '220px' }}
              >
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                  >
                    <div
                      className={
                        m.role === 'user'
                          ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-cream'
                          : 'max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-primary'
                      }
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {thinking && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-primary/50">
                      typing…
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <p className="px-4 pb-1 text-xs text-red-700">{error}</p>
              )}

              <div className="border-t border-muted-dark/30 bg-cream px-3 py-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    rows={1}
                    placeholder="Type your reply…"
                    className="flex-1 resize-none rounded-lg border border-muted-dark/40 bg-white px-3 py-2 text-sm text-primary focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => sendMessage()}
                    disabled={thinking || !input.trim()}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-cream disabled:opacity-40 hover:bg-primary-light transition"
                  >
                    Send
                  </button>
                </div>

                {/* Quick-start chips: shown only at the very start of the chat. */}
                {messages.length === 1 && !thinking && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => sendMessage(s.text)}
                        className="rounded-full border border-primary/30 bg-white px-3 py-1 text-xs font-semibold text-primary hover:bg-muted transition"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={sendToTeam}
                  disabled={sending}
                  className="mt-2 w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50 hover:bg-accent-light transition"
                >
                  {sending ? 'Sending…' : 'Send to the team'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
