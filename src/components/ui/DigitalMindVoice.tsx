// Digital Mind — Voice Mode.
//
// A hands-free, voice-first view of the Digital Mind chat: the visitor talks to
// an animated avatar of Varun's photo. Speech is recognised in the browser
// (Web Speech API), answered by the same /api/digital-mind/chat stream as the
// text chat, and spoken back with speech synthesis while the avatar "talks".
//
// Everything runs client-side with browser APIs — no extra keys, no external
// calls beyond the same-origin chat endpoint (CSP-safe). If
// `public/dm-avatar-loop.mp4` exists (an AI-generated idle loop of the photo,
// e.g. an image-to-video "still + blink" loop), it fades in over the photo for
// a true living-avatar look; otherwise the CSS-animated photo is used.

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

const AVATAR_IMG = "/varun-avatar.jpg";
const AVATAR_LOOP = "/dm-avatar-loop.mp4";
const BAR_DELAYS = [0, 0.12, 0.24, 0.36, 0.48];

// Mouth-sync calibration for varun-avatar.jpg (fractions of image height).
// MOUTH_Y is the lips line; everything below it drops down (jaw) while the lip
// strip above it stretches — the classic talking-photo warp. Tune these two if
// the photo changes.
const MOUTH_Y = 0.44;
const MOUTH_STRIP = 0.035;
const MOUTH_MAX_DELTA = 0.07;

/** Draw the photo with the jaw dropped by `open` (0..1) — canvas "lip sync". */
function drawTalkingFace(canvas: HTMLCanvasElement, img: HTMLImageElement, open: number) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const delta = Math.max(0, Math.min(1, open)) * MOUTH_MAX_DELTA * h;
  const mouthY = MOUTH_Y * h;
  const strip = MOUTH_STRIP * h;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.clearRect(0, 0, w, h);
  // 1. Everything above the lips — fixed.
  ctx.drawImage(img, 0, 0, w, mouthY, 0, 0, w, mouthY);
  // 2. The lip strip — stretched downward by the open amount.
  ctx.drawImage(img, 0, mouthY, w, strip, 0, mouthY, w, strip + delta);
  // 3. Everything below (jaw/chin/body) — displaced down with the jaw
  //    (the bottom edge is clipped naturally by the frame).
  const rest = h - (mouthY + strip);
  if (rest > 0) {
    ctx.drawImage(img, 0, mouthY + strip, w, rest, 0, mouthY + strip + delta, w, rest);
  }
}

/** Strip Markdown so the spoken reply sounds natural. */
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " …code snippet omitted… ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[*_~>#|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split into speakable chunks (~sentence sized) — long single utterances
    stall on some browsers, so answers are queued piece by piece. */
function chunkForSpeech(text: string, max = 190): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?]+["')\]]*\s*|[^.!?\n]+$/g) ?? [text];
  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    const piece = s.trim();
    if (!piece) continue;
    if ((cur + " " + piece).trim().length > max && cur) {
      chunks.push(cur.trim());
      cur = piece;
    } else {
      cur = `${cur} ${piece}`;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

function getSpeechRecognition(): (new () => any) | null {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
}

export default function DigitalMindVoice({
  busy,
  onAsk,
  onExit,
}: {
  busy: boolean;
  /** Send a message through the normal chat pipeline; resolves to the answer text. */
  onAsk: (text: string) => Promise<string>;
  onExit: () => void;
}) {
  const [phase, setPhaseState] = useState<VoicePhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [loopSrc, setLoopSrc] = useState<string | null>(null);

  const phaseRef = useRef<VoicePhase>("idle");
  const activeRef = useRef(true);
  const autoListenRef = useRef(true);
  const gotResultRef = useRef(false);
  const recRef = useRef<any>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const speakTokenRef = useRef(0);
  const askTokenRef = useRef(0);
  const resumeTimerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouthTargetRef = useRef(0);
  const mouthFallbackRef = useRef<number | null>(null);
  const boundarySeenRef = useRef(false);

  const recognitionSupported = typeof window !== "undefined" && getSpeechRecognition() !== null;
  const synthSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  function setPhase(p: VoicePhase) {
    phaseRef.current = p;
    setPhaseState(p);
  }

  // ── Speech synthesis ──────────────────────────────────────────────

  function pickVoice(): SpeechSynthesisVoice | undefined {
    const vs = voicesRef.current;
    if (!vs.length) return undefined;
    const en = vs.filter((v) => v.lang?.toLowerCase().startsWith("en"));
    const pool = en.length > 0 ? en : vs;
    return (
      pool.find((v) => /google us english/i.test(v.name)) ??
      pool.find((v) => /david|daniel|guy|andrew|brian|alex/i.test(v.name)) ??
      pool.find((v) => /natural|neural/i.test(v.name)) ??
      pool[0]
    );
  }

  function clearResumeTimer() {
    if (resumeTimerRef.current !== null) {
      window.clearInterval(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }

  function cancelSpeech() {
    speakTokenRef.current += 1;
    clearResumeTimer();
    clearMouthFallback();
    mouthTargetRef.current = 0; // close the mouth
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  }

  // ── Mouth-sync (canvas lip sync driven by speech timing) ───────────

  function clearMouthFallback() {
    if (mouthFallbackRef.current !== null) {
      window.clearInterval(mouthFallbackRef.current);
      mouthFallbackRef.current = null;
    }
  }

  /** Word boundary → snap the mouth open, decay to nearly closed. */
  function onSpeechBoundary() {
    boundarySeenRef.current = true;
    mouthTargetRef.current = 0.55 + Math.random() * 0.45;
    window.setTimeout(
      () => {
        mouthTargetRef.current = 0.08 + Math.random() * 0.18;
      },
      90 + Math.random() * 110
    );
  }

  /** Fallback articulation for engines that never fire boundary events. */
  function startMouthFallback() {
    clearMouthFallback();
    boundarySeenRef.current = false;
    mouthFallbackRef.current = window.setInterval(() => {
      if (!boundarySeenRef.current) {
        mouthTargetRef.current = 0.2 + Math.random() * 0.7;
      }
    }, 130);
  }

  function speak(text: string) {
    const synth = window.speechSynthesis;
    if (!synthSupported || !synth) {
      scheduleRelisten(600);
      return;
    }
    cancelSpeech();
    const token = speakTokenRef.current;
    const chunks = chunkForSpeech(stripMarkdown(text));
    if (chunks.length === 0) {
      scheduleRelisten(600);
      return;
    }
    setPhase("speaking");
    startMouthFallback();
    // Work around a Chromium bug where long speech silently stalls (~15s):
    // a periodic pause/resume keeps the queue alive.
    resumeTimerRef.current = window.setInterval(() => {
      try {
        if (synth.speaking && !synth.paused) {
          synth.pause();
          synth.resume();
        }
      } catch {
        /* ignore */
      }
    }, 10_000);

    let i = 0;
    const next = () => {
      if (token !== speakTokenRef.current) return; // cancelled or superseded
      if (i >= chunks.length) {
        finishSpeaking();
        return;
      }
      const u = new SpeechSynthesisUtterance(chunks[i++]);
      const voice = pickVoice();
      if (voice) u.voice = voice;
      u.rate = 1;
      u.onboundary = onSpeechBoundary; // drives the canvas lip sync
      u.onend = next;
      u.onerror = next;
      synth.speak(u);
    };
    next();
  }

  function finishSpeaking() {
    clearResumeTimer();
    clearMouthFallback();
    mouthTargetRef.current = 0; // close the mouth
    setPhase("idle");
    scheduleRelisten(450);
  }

  // ── Speech recognition ────────────────────────────────────────────

  function getRecognition(): any | null {
    const SR = getSpeechRecognition();
    if (!SR) return null;
    if (!recRef.current) {
      const rec = new SR();
      rec.lang = "en-US";
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;

      rec.onresult = (e: any) => {
        let interim = "";
        let final = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) final += r[0]?.transcript ?? "";
          else interim += r[0]?.transcript ?? "";
        }
        if (final.trim()) {
          gotResultRef.current = true;
          setTranscript(final.trim());
          void ask(final.trim());
        } else if (interim.trim()) {
          setTranscript(interim.trim());
        }
      };

      rec.onerror = (e: any) => {
        const err = e?.error ?? "";
        if (err === "not-allowed" || err === "service-not-allowed") {
          autoListenRef.current = false;
          setHint("Microphone access was blocked — allow the mic, or type below.");
          setPhase("idle");
        } else if (err && err !== "no-speech" && err !== "aborted" && err !== "audio-capture") {
          setHint(`Mic hiccup (${err}) — tap the mic to retry, or type below.`);
        }
        // "no-speech"/"aborted"/"audio-capture" are benign; onend handles the restart.
      };

      rec.onend = () => {
        // With continuous=false the recogniser stops after a phrase or a
        // silence timeout. Keep the mic hot while we're still in listening
        // phase and nothing was recognised yet.
        if (
          activeRef.current &&
          autoListenRef.current &&
          phaseRef.current === "listening" &&
          !gotResultRef.current
        ) {
          try {
            rec.start();
          } catch {
            /* already started */
          }
        }
      };

      recRef.current = rec;
    }
    return recRef.current;
  }

  function startListening() {
    const rec = getRecognition();
    if (!rec) {
      setHint(
        "Voice input isn't supported in this browser — type below; I'll still speak my replies."
      );
      setPhase("idle");
      return;
    }
    cancelSpeech();
    gotResultRef.current = false;
    setHint(null);
    setPhase("listening");
    try {
      rec.start();
    } catch {
      /* already running */
    }
  }

  function scheduleRelisten(delay: number) {
    window.setTimeout(() => {
      if (activeRef.current && autoListenRef.current && phaseRef.current === "idle") {
        startListening();
      }
    }, delay);
  }

  // ── Conversation flow ─────────────────────────────────────────────

  async function ask(text: string) {
    const q = text.trim();
    if (!q) return;
    const token = ++askTokenRef.current;
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setTranscript(q);
    setReply("");
    setPhase("thinking");
    let answer = "";
    try {
      answer = await onAsk(q);
    } catch {
      answer = "";
    }
    // A newer question (or a mic tap) supersedes this one — don't speak over it.
    if (!activeRef.current || token !== askTokenRef.current) return;
    if (!answer) {
      setPhase("idle");
      scheduleRelisten(900);
      return;
    }
    setReply(answer.length > 260 ? `${answer.slice(0, 257)}…` : answer);
    speak(answer);
  }

  function onMicButton() {
    if (phaseRef.current === "listening") {
      autoListenRef.current = false;
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
      setPhase("idle");
    } else {
      // Barge-in: stop whatever is playing and listen immediately.
      askTokenRef.current += 1; // invalidate any in-flight question
      autoListenRef.current = true;
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
      startListening();
    }
  }

  function onTypedSubmit(e: FormEvent) {
    e.preventDefault();
    const q = typed.trim();
    if (!q || busy) return;
    setTyped("");
    void ask(q);
  }

  // ── Canvas mouth loop — redraws the photo with the jaw dropped by the
  //    current smoothed open amount (rAF; cheap for a small canvas) ──────

  useEffect(() => {
    const img = new Image();
    img.src = AVATAR_IMG;
    let raf = 0;
    let open = 0;
    const draw = () => {
      open += (mouthTargetRef.current - open) * 0.35; // smoothing
      if (canvasRef.current && img.complete && img.naturalWidth > 0) {
        drawTalkingFace(canvasRef.current, img, open);
      }
      raf = window.requestAnimationFrame(draw);
    };
    const start = () => {
      if (!raf) raf = window.requestAnimationFrame(draw);
    };
    if (img.complete && img.naturalWidth > 0) start();
    else img.addEventListener("load", start, { once: true });
    return () => {
      img.removeEventListener("load", start);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  // ── Lifecycle ─────────────────────────────────────────────────────

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only — starts the voice session and registers its cleanup
  useEffect(() => {
    activeRef.current = true;
    const loadVoices = () => {
      try {
        voicesRef.current = window.speechSynthesis?.getVoices() ?? [];
      } catch {
        /* ignore */
      }
    };
    loadVoices();
    window.speechSynthesis?.addEventListener?.("voiceschanged", loadVoices);

    // If an AI-generated idle loop of the avatar exists, layer it over the
    // photo (see docs/digital-mind.md — "living avatar"). Otherwise the
    // CSS-animated photo is the avatar.
    let videoProbeCancelled = false;
    fetch(AVATAR_LOOP, { method: "HEAD" })
      .then((r) => {
        if (!videoProbeCancelled && r.ok) setLoopSrc(AVATAR_LOOP);
      })
      .catch(() => {
        /* no loop video available — photo fallback */
      });

    if (recognitionSupported) {
      startListening();
    } else {
      setHint(
        "Voice input isn't supported in this browser — type below; I'll still speak my replies."
      );
    }

    return () => {
      activeRef.current = false;
      videoProbeCancelled = true;
      window.speechSynthesis?.removeEventListener?.("voiceschanged", loadVoices);
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
      cancelSpeech();
    };
  }, []);

  const statusText =
    phase === "listening"
      ? "Listening — speak now"
      : phase === "thinking"
        ? "Thinking…"
        : phase === "speaking"
          ? "Speaking… (tap the mic to interrupt)"
          : (hint ?? "Tap the mic to speak");

  return (
    <div className="dm-voice">
      <div className="dm-voice__stage">
        <div className={`dm-voice__avatar dm-voice__avatar--${phase}`}>
          <span className="dm-voice__glow" aria-hidden="true" />
          <span className="dm-voice__ring dm-voice__ring--1" aria-hidden="true" />
          <span className="dm-voice__ring dm-voice__ring--2" aria-hidden="true" />
          <span className="dm-voice__spin" aria-hidden="true" />
          <canvas
            ref={canvasRef}
            className="dm-voice__canvas"
            role="img"
            aria-label="Varun's digital avatar"
          />
          {loopSrc && phase !== "speaking" && (
            <video
              className="dm-voice__video dm-voice__video--ready"
              src={loopSrc}
              autoPlay
              muted
              loop
              playsInline
              tabIndex={-1}
              onError={() => setLoopSrc(null)}
            />
          )}
        </div>
        <div className={`dm-voice__bars dm-voice__bars--${phase}`} aria-hidden="true">
          {BAR_DELAYS.map((delay) => (
            <span key={delay} style={{ animationDelay: `${delay}s` }} />
          ))}
        </div>
        <output className="dm-voice__status">{statusText}</output>
      </div>

      <div className="dm-voice__transcript">
        {transcript && <p className="dm-voice__line dm-voice__line--user">“{transcript}”</p>}
        {reply && <p className="dm-voice__line dm-voice__line--reply">{reply}</p>}
        {!transcript && !reply && (
          <p className="dm-voice__hint">
            Talk to Varun's Digital Mind — ask about projects, robotics, AI, or engineering work.
          </p>
        )}
      </div>

      <div className="dm-voice__controls">
        <button
          type="button"
          className={`dm-voice__mic${phase === "listening" ? " dm-voice__mic--on" : ""}`}
          onClick={onMicButton}
          disabled={!recognitionSupported}
          aria-label={phase === "listening" ? "Stop listening" : "Start listening"}
          title={
            recognitionSupported
              ? phase === "listening"
                ? "Stop listening"
                : "Start listening"
              : "Voice input not supported in this browser"
          }
        >
          <MicIcon />
        </button>
        <form className="dm-voice__typeform" onSubmit={onTypedSubmit}>
          <input
            className="dm-voice__typeinput"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="…or type your question"
            disabled={busy}
            aria-label="Type a question"
          />
        </form>
        <button type="button" className="dm-voice__exit" onClick={onExit}>
          Back to chat
        </button>
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <path d="M12 18v4" />
    </svg>
  );
}
