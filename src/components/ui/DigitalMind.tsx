import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DIGITAL_MIND } from "../../consts";
import "./digital-mind.css";

type Source = { title: string; url: string; snippet: string };

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  followups?: string[];
  streaming?: boolean;
  error?: boolean;
};

type StreamEvent =
  | { type: "sources"; sources: Source[] }
  | { type: "token"; text: string }
  | { type: "followups"; followups: string[] }
  | { type: "error"; message: string }
  | { type: "done" };

const STORAGE_KEY = "digital-mind:messages";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function DigitalMind() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Restore this session's conversation.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw) as Message[]);
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  // Persist (never persist a mid-stream flag).
  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(messages.map((m) => ({ ...m, streaming: false })))
      );
    } catch {
      /* storage may be unavailable */
    }
  }, [messages]);

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    if (open && messages.length > 0 && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, open]);

  // Open behaviour: focus composer, lock body scroll, close on Escape.
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    html.classList.add("overflow-hidden");
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      html.classList.remove("overflow-hidden");
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Abort any in-flight request if the island unmounts (e.g. page navigation).
  useEffect(() => () => abortRef.current?.abort(), []);

  function updateLastAssistant(updater: (m: Message) => Message) {
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === "assistant") {
          next[i] = updater(next[i]);
          break;
        }
      }
      return next;
    });
  }

  function handleEvent(evt: StreamEvent) {
    switch (evt.type) {
      case "sources":
        updateLastAssistant((m) => ({ ...m, sources: evt.sources }));
        break;
      case "token":
        updateLastAssistant((m) => ({ ...m, content: m.content + (evt.text ?? "") }));
        break;
      case "followups":
        updateLastAssistant((m) => ({ ...m, followups: evt.followups }));
        break;
      case "error":
        updateLastAssistant((m) => ({
          ...m,
          content: (m.content ? `${m.content}\n\n` : "") + evt.message,
          error: true,
        }));
        break;
      case "done":
        break;
    }
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;

    setInput("");
    const userMsg: Message = { id: uid(), role: "user", content: q };
    const assistantMsg: Message = { id: uid(), role: "assistant", content: "", streaming: true };
    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setBusy(true);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch(DIGITAL_MIND.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            handleEvent(JSON.parse(payload) as StreamEvent);
          } catch {
            /* skip malformed frame */
          }
        }
      }
    } catch (err) {
      if (!ac.signal.aborted) {
        updateLastAssistant((m) => ({
          ...m,
          content: m.content || "I couldn't reach the server just now — please try again.",
          error: true,
        }));
      }
    } finally {
      updateLastAssistant((m) => ({ ...m, streaming: false }));
      setBusy(false);
      abortRef.current = null;
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function clearChat() {
    abortRef.current?.abort();
    setMessages([]);
    setBusy(false);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  if (!DIGITAL_MIND.enabled) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          className="dm-fab"
          aria-label={`Open ${DIGITAL_MIND.title}`}
          onClick={() => setOpen(true)}
        >
          <SparkIcon className="dm-fab__icon" />
          <span className="dm-fab__label">{DIGITAL_MIND.buttonLabel}</span>
        </button>
      )}

      {open && (
        <div
          className="dm-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={DIGITAL_MIND.title}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="dm-panel">
            <header className="dm-header">
              <img
                className="dm-header__avatar"
                src="/varun-avatar.jpg"
                alt=""
                aria-hidden="true"
              />
              <div className="dm-header__meta">
                <span className="dm-header__title">{DIGITAL_MIND.title}</span>
                <span className="dm-header__subtitle">{DIGITAL_MIND.subtitle}</span>
              </div>
              {messages.length > 0 && (
                <button
                  type="button"
                  className="dm-iconbtn"
                  aria-label="Start a new conversation"
                  title="New conversation"
                  onClick={clearChat}
                >
                  <NewIcon />
                </button>
              )}
              <button
                type="button"
                className="dm-iconbtn"
                aria-label="Close"
                title="Close"
                onClick={() => setOpen(false)}
              >
                <CloseIcon />
              </button>
            </header>

            <div className="dm-body" ref={bodyRef}>
              {messages.length === 0 ? (
                <div className="dm-empty">
                  <p className="dm-empty__lead">{DIGITAL_MIND.intro}</p>
                  <div className="dm-examples">
                    {DIGITAL_MIND.examples.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        className="dm-example"
                        onClick={() => send(ex)}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <MessageBubble key={m.id} message={m} onFollowup={send} busy={busy} />
                ))
              )}
            </div>

            <form className="dm-form" onSubmit={onSubmit}>
              <textarea
                ref={inputRef}
                className="dm-input"
                rows={1}
                placeholder={DIGITAL_MIND.placeholder}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={busy}
                aria-label="Ask a question"
              />
              <button
                type="submit"
                className="dm-send"
                disabled={busy || input.trim().length === 0}
                aria-label="Send"
              >
                <SendIcon />
              </button>
            </form>
            <p className="dm-footnote">{DIGITAL_MIND.disclaimer}</p>
          </div>
        </div>
      )}
    </>
  );
}

function MessageBubble({
  message,
  onFollowup,
  busy,
}: {
  message: Message;
  onFollowup: (text: string) => void;
  busy: boolean;
}) {
  const isUser = message.role === "user";
  const showTyping = message.streaming && message.content.length === 0;

  return (
    <div className={`dm-msg ${isUser ? "dm-msg--user" : "dm-msg--assistant"}`}>
      <div className={`dm-bubble${message.error ? " dm-bubble--error" : ""}`}>
        {isUser ? (
          message.content
        ) : showTyping ? (
          <span className="dm-typing" aria-label="Thinking">
            <span />
            <span />
            <span />
          </span>
        ) : (
          <div className="dm-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ node, ...props }) => (
                  <a {...props} target="_blank" rel="noopener noreferrer nofollow" />
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {!isUser && message.sources && message.sources.length > 0 && (
        <div className="dm-sources">
          {message.sources.map((s) => (
            <a key={s.url} className="dm-source" href={s.url} title={s.snippet}>
              <LinkIcon />
              <span className="dm-source__label">{s.title}</span>
            </a>
          ))}
        </div>
      )}

      {!isUser && !message.streaming && message.followups && message.followups.length > 0 && (
        <div className="dm-followups">
          <span className="dm-followups__heading">Follow up</span>
          {message.followups.map((f) => (
            <button
              key={f}
              type="button"
              className="dm-chip"
              onClick={() => onFollowup(f)}
              disabled={busy}
            >
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Inline icons (no external assets, inherit currentColor) ─────────── */

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z"
        fill="currentColor"
      />
      <path d="M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" fill="currentColor" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function NewIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </svg>
  );
}
