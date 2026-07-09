import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import "./admin.css";

const ENDPOINT = "/api/digital-mind/admin";
const TOKEN_KEY = "digital-mind:admin-token";

type Overview = {
  memoryEnabled: boolean;
  model: string;
  retrievalMode: string;
  embeddings: string | null;
  canIndexUploads: boolean;
  usage: {
    turns: number;
    inputTokens: number;
    outputTokens: number;
    byModel: Record<string, number>;
  };
};
type Conversation = { id: string; created_at: string; updated_at: string };
type Msg = {
  role: string;
  content: string;
  sources?: { title: string; url: string }[];
  created_at: string;
};
type Doc = { id: string; title: string; url: string; tags: string[]; created_at: string };

type Tab = "overview" | "conversations" | "documents" | "prompt";

export default function AdminPanel() {
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  const [overview, setOverview] = useState<Overview | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<{ id: string; messages: Msg[] } | null>(null);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [persona, setPersona] = useState("");
  const [upload, setUpload] = useState({ title: "", content: "", url: "" });
  const [flash, setFlash] = useState<string | null>(null);

  const call = useCallback(
    async (opts: {
      method?: string;
      action?: string;
      params?: Record<string, string>;
      body?: unknown;
    }) => {
      const t = sessionStorage.getItem(TOKEN_KEY) ?? "";
      const qs = new URLSearchParams({
        ...(opts.action ? { action: opts.action } : {}),
        ...(opts.params ?? {}),
      }).toString();
      const res = await fetch(`${ENDPOINT}${qs ? `?${qs}` : ""}`, {
        method: opts.method ?? "GET",
        headers: {
          Authorization: `Bearer ${t}`,
          ...(opts.body ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
      return data;
    },
    []
  );

  const loadTab = useCallback(
    async (which: Tab) => {
      setError(null);
      setBusy(true);
      try {
        if (which === "overview") setOverview((await call({ action: "overview" })) as Overview);
        if (which === "conversations")
          setConversations((await call({ action: "conversations" })) as Conversation[]);
        if (which === "documents") setDocuments((await call({ action: "documents" })) as Doc[]);
        if (which === "prompt")
          setPersona(((await call({ action: "prompt" })) as { persona: string }).persona);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [call]
  );

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) {
      setToken(saved);
      setAuthed(true);
    }
  }, []);

  useEffect(() => {
    if (authed) loadTab(tab);
  }, [authed, tab, loadTab]);

  async function unlock(e: FormEvent) {
    e.preventDefault();
    setError(null);
    sessionStorage.setItem(TOKEN_KEY, token);
    try {
      await call({ action: "overview" });
      setAuthed(true);
    } catch (err) {
      setError((err as Error).message);
      sessionStorage.removeItem(TOKEN_KEY);
    }
  }

  function lock() {
    sessionStorage.removeItem(TOKEN_KEY);
    setAuthed(false);
    setToken("");
    setOverview(null);
  }

  async function openConversation(id: string) {
    setBusy(true);
    try {
      const messages = (await call({ action: "conversation", params: { id } })) as Msg[];
      setActiveConv({ id, messages });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function savePersona() {
    setBusy(true);
    setFlash(null);
    try {
      await call({ method: "POST", body: { action: "prompt", value: persona } });
      setFlash("Prompt saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitUpload(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    setError(null);
    try {
      const res = (await call({ method: "POST", body: { action: "upload", ...upload } })) as {
        chunks: number;
      };
      setFlash(`Uploaded and indexed (${res.chunks} chunks).`);
      setUpload({ title: "", content: "", url: "" });
      await loadTab("documents");
    } catch (e2) {
      setError((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeDoc(id: string) {
    setBusy(true);
    try {
      await call({ method: "POST", body: { action: "deleteDoc", docId: id } });
      setDocuments((d) => d.filter((x) => x.id !== id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!authed) {
    return (
      <div className="dm-admin">
        <h1>Digital Mind — Admin</h1>
        <p className="dm-admin__lead">Enter your admin token to continue.</p>
        <form className="dm-admin__gate" onSubmit={unlock}>
          <input
            type="password"
            placeholder="DIGITAL_MIND_ADMIN_TOKEN"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            aria-label="Admin token"
          />
          <button className="dm-admin__btn" type="submit" disabled={!token.trim()}>
            Unlock
          </button>
          {error && <p className="dm-admin__error">{error}</p>}
        </form>
      </div>
    );
  }

  const tabs: Tab[] = ["overview", "conversations", "documents", "prompt"];

  return (
    <div className="dm-admin">
      <h1>Digital Mind — Admin</h1>
      <p className="dm-admin__lead">
        Manage the assistant's knowledge, review conversations, and monitor usage.{" "}
        <button
          type="button"
          className="dm-admin__btn--danger"
          onClick={lock}
          style={{ border: "none", background: "none" }}
        >
          Sign out
        </button>
      </p>

      <div className="dm-admin__tabs">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            className={`dm-admin__tab${tab === t ? " dm-admin__tab--active" : ""}`}
            onClick={() => {
              setTab(t);
              setActiveConv(null);
              setFlash(null);
            }}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {error && <p className="dm-admin__error">{error}</p>}
      {flash && <p className="dm-admin__note">{flash}</p>}

      {tab === "overview" && overview && (
        <>
          <div className="dm-admin__grid">
            <div className="dm-admin__stat">
              <b>{overview.usage.turns}</b>
              <span>Turns logged</span>
            </div>
            <div className="dm-admin__stat">
              <b>{overview.usage.inputTokens.toLocaleString()}</b>
              <span>Input tokens</span>
            </div>
            <div className="dm-admin__stat">
              <b>{overview.usage.outputTokens.toLocaleString()}</b>
              <span>Output tokens</span>
            </div>
          </div>
          <ul className="dm-admin__list">
            <li className="dm-admin__row">
              <span>Model</span>
              <span className="dm-admin__muted">{overview.model}</span>
            </li>
            <li className="dm-admin__row">
              <span>Retrieval</span>
              <span className="dm-admin__muted">{overview.retrievalMode}</span>
            </li>
            <li className="dm-admin__row">
              <span>Embeddings</span>
              <span className="dm-admin__muted">{overview.embeddings ?? "off"}</span>
            </li>
            <li className="dm-admin__row">
              <span>Memory</span>
              <span className="dm-admin__muted">{overview.memoryEnabled ? "on" : "off"}</span>
            </li>
          </ul>
        </>
      )}

      {tab === "conversations" && (
        <>
          {!activeConv && (
            <ul className="dm-admin__list">
              {conversations.length === 0 && (
                <p className="dm-admin__muted">No conversations yet (needs memory enabled).</p>
              )}
              {conversations.map((c) => (
                <li key={c.id} className="dm-admin__row">
                  <span className="dm-admin__row-main">{c.id}</span>
                  <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <span className="dm-admin__muted">
                      {new Date(c.updated_at).toLocaleString()}
                    </span>
                    <button
                      type="button"
                      className="dm-admin__btn--ghost dm-admin__btn"
                      onClick={() => openConversation(c.id)}
                    >
                      View
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {activeConv && (
            <>
              <button
                type="button"
                className="dm-admin__btn--ghost dm-admin__btn"
                onClick={() => setActiveConv(null)}
              >
                ← Back
              </button>
              <div style={{ marginTop: "1rem" }}>
                {activeConv.messages.map((m) => (
                  <div
                    key={`${m.created_at}-${m.role}`}
                    className={`dm-admin__msg${m.role === "user" ? " dm-admin__msg--user" : ""}`}
                  >
                    <div className="dm-admin__muted">{m.role}</div>
                    {m.content}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "documents" && (
        <>
          {!overview?.canIndexUploads && (
            <p className="dm-admin__note">
              Uploading documents requires hybrid retrieval (Supabase + an embeddings key). You can
              still add documents via the <code>content/knowledge/</code> folder at build time.
            </p>
          )}
          <form onSubmit={submitUpload} style={{ marginBottom: "1.5rem" }}>
            <div className="dm-admin__field">
              <label htmlFor="doc-title">Title</label>
              <input
                id="doc-title"
                value={upload.title}
                onChange={(e) => setUpload({ ...upload, title: e.target.value })}
              />
            </div>
            <div className="dm-admin__field">
              <label htmlFor="doc-url">Source URL (optional)</label>
              <input
                id="doc-url"
                value={upload.url}
                onChange={(e) => setUpload({ ...upload, url: e.target.value })}
              />
            </div>
            <div className="dm-admin__field">
              <label htmlFor="doc-content">Content (Markdown or text)</label>
              <textarea
                id="doc-content"
                value={upload.content}
                onChange={(e) => setUpload({ ...upload, content: e.target.value })}
              />
            </div>
            <button
              className="dm-admin__btn"
              type="submit"
              disabled={
                busy || !overview?.canIndexUploads || !upload.title.trim() || !upload.content.trim()
              }
            >
              Upload & index
            </button>
          </form>
          <ul className="dm-admin__list">
            {documents.length === 0 && <p className="dm-admin__muted">No uploaded documents.</p>}
            {documents.map((d) => (
              <li key={d.id} className="dm-admin__row">
                <span className="dm-admin__row-main">{d.title}</span>
                <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span className="dm-admin__muted">
                    {new Date(d.created_at).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    className="dm-admin__btn--danger"
                    onClick={() => removeDoc(d.id)}
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "prompt" && (
        <>
          <p className="dm-admin__lead">
            Override the assistant's persona/system prompt. Leave empty to use the built-in default.
            Changes apply within a few minutes.
          </p>
          <textarea
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            style={{ minHeight: "12rem" }}
          />
          <div style={{ marginTop: "0.75rem" }}>
            <button className="dm-admin__btn" type="button" onClick={savePersona} disabled={busy}>
              Save prompt
            </button>
          </div>
        </>
      )}
    </div>
  );
}
