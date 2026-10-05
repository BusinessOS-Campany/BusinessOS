"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Mic, Send, Sparkles, Square, Volume2, VolumeX, X } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/* ── Minimal Web Speech API typing (recognition is not in lib.dom) ── */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  readonly results: ArrayLike<{
    readonly isFinal: boolean;
    readonly [index: number]: { readonly transcript: string };
  }>;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export default function AiChatModal({ open, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "مرحباً! أنا مساعدك التجاري. اسألني عن المبيعات، المخزون، أو العملاء وسأرد عليك من بيانات مؤسستك — بالصوت أو بالكتابة.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);

  const [micSupported] = useState(
    () => typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  );
  const [ttsSupported] = useState(
    () => typeof window !== "undefined" && "speechSynthesis" in window,
  );

  const bodyRef = useRef<HTMLDivElement>(null);
  const [rec, setRec] = useState<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      window.speechSynthesis?.cancel();
      rec?.abort();
    };
  }, [open, onClose, rec]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, listening]);

  if (!open) return null;

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ar-SA";
    const arVoice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("ar"));
    if (arVoice) u.voice = arVoice;
    u.rate = 1;
    u.pitch = 1.02;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  const stopListening = () => {
    rec?.stop();
    setListening(false);
  };

  const toggleListening = () => {
    if (listening) {
      stopListening();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "ar-SA";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res[0].transcript;
        if (res.isFinal) final += t;
        else interim += t;
      }
      if (final) {
        setInput(final);
        r.stop();
        setListening(false);
        const text = final.trim();
        if (text) sendText(text);
      } else if (interim) {
        setInput(interim);
      }
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.start();
    setRec(r);
    setListening(true);
  };

  const toggleVoice = () => {
    if (voiceOn) {
      setVoiceOn(false);
      setSpeaking(false);
      window.speechSynthesis?.cancel();
    } else {
      setVoiceOn(true);
      const last = [...messages].reverse().find((m) => m.role === "assistant");
      if (last) speak(last.content);
    }
  };

  const sendText = async (raw: string) => {
    const text = raw.trim();
    if (!text || sending) return;
    setInput("");
    setError("");
    setAuthNeeded(false);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setSending(true);
    try {
      const res = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (res.status === 401 || res.status === 403) {
        setAuthNeeded(true);
      } else if (!res.ok) {
        const err = (await res.json().catch(() => null))?.error;
        setError(err?.messageAr ?? "تعذر الرد، حاول مرة أخرى.");
      } else {
        const reply = (await res.json())?.data?.message ?? "تم.";
        setMessages((m) => [...m, { role: "assistant", content: reply }]);
        if (voiceOn) speak(reply);
      }
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setSending(false);
    }
  };

  const send = () => sendText(input);

  const status = listening
    ? ({ label: "أستمع إليك…", bar: true } as const)
    : sending
      ? ({ label: "أفكر في الإجابة…", bar: false } as const)
      : speaking
        ? ({ label: "أتحدث الآن…", bar: true } as const)
        : ({ label: "متصل ببيانات مؤسستك", bar: false } as const);

  return (
    <div dir="rtl" className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-8">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="إغلاق"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-md animate-fade-in"
      />

      {/* Floating glow orbs behind the panel */}
      <div className="pointer-events-none absolute left-[6%] top-[10%] h-40 w-40 rounded-full bg-primary/25 blur-3xl animate-float" />
      <div className="pointer-events-none absolute right-[4%] bottom-[8%] h-44 w-44 rounded-full bg-[#0263D1]/30 blur-3xl animate-float [animation-delay:1.6s]" />

      {/* Floating panel */}
      <div className="relative w-full max-w-md rounded-[32px] bg-[linear-gradient(150deg,rgba(3,234,188,0.5),rgba(255,255,255,0.07)_35%,rgba(2,99,209,0.18)_60%,rgba(3,234,188,0.4))] p-px shadow-[0_24px_80px_-20px_rgba(3,234,188,0.3),0_32px_64px_-16px_rgba(0,0,0,0.65)] animate-modal-pop">
        <div className="relative flex h-[min(660px,84dvh)] flex-col overflow-hidden rounded-[31px] bg-background/90 backdrop-blur-2xl">
          {/* Top sheen */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(3,234,188,0.14),transparent_70%)]" />

          {/* Header */}
          <div className="relative z-10 flex items-center gap-3 border-b border-white/10 px-5 pb-4 pt-5">
            <div className="relative h-11 w-11 shrink-0">
              <div className="absolute -inset-[3px] rounded-full bg-gradient-to-tr from-primary via-transparent to-[#0263D1] opacity-70 animate-ring-spin" />
              <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-[#0263D1]/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] animate-orb-pulse">
                <Bot className="h-5 w-5 text-primary" />
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-extrabold text-gradient">المساعد الذكي</h2>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {status.bar ? (
                  <span className="flex h-3 items-end gap-[3px]" aria-hidden>
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="w-[3px] origin-bottom rounded-full bg-primary animate-[soundbar_1s_ease-in-out_infinite]"
                        style={{ height: d === 1 ? 12 : 9, animationDelay: `${d * 130}ms` }}
                      />
                    ))}
                  </span>
                ) : sending ? (
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
                ) : (
                  <Sparkles className="h-3 w-3 shrink-0 text-primary/60" />
                )}
                <span className="truncate">{status.label}</span>
              </div>
            </div>

            {ttsSupported && (
              <button
                type="button"
                onClick={toggleVoice}
                aria-pressed={voiceOn}
                aria-label={voiceOn ? "إيقاف الرد الصوتي" : "تفعيل الرد الصوتي"}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all active:scale-90 ${
                  voiceOn
                    ? "bg-primary/15 text-primary shadow-[0_0_14px_rgba(3,234,188,0.4)]"
                    : "text-muted-foreground hover:bg-white/10 hover:text-foreground"
                }`}
              >
                {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-white/10 hover:text-foreground active:scale-90"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          {authNeeded ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="relative h-16 w-16">
                <div className="absolute -inset-[3px] rounded-full bg-gradient-to-tr from-primary via-transparent to-[#0263D1] opacity-70 animate-ring-spin" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/25 to-[#0263D1]/15 animate-orb-pulse">
                  <Bot className="h-8 w-8 text-primary" />
                </div>
              </div>
              <div>
                <p className="font-bold text-foreground">تسجيل الدخول مطلوب</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  يجب تسجيل الدخول إلى حسابك لاستخدام المساعد الذكي والوصول إلى بيانات مؤسستك.
                </p>
              </div>
              <Link
                href="/signin"
                className="inline-flex items-center rounded-full bg-gradient-to-l from-primary to-[#0bc9a9] px-6 py-2.5 text-sm font-semibold text-zinc-950 shadow-[0_8px_24px_-8px_rgba(3,234,188,0.7)] transition-all hover:brightness-110 active:scale-95"
              >
                تسجيل الدخول
              </Link>
            </div>
          ) : (
            <>
              <div
                ref={bodyRef}
                className="dot-grid flex-1 space-y-3 overflow-y-auto px-5 py-5 text-primary/[0.07] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex w-full justify-end animate-bubble-in">
                      <p className="max-w-[80%] whitespace-pre-wrap rounded-[20px] rounded-bl-sm bg-gradient-to-br from-primary to-[#0bc9a9] px-4 py-2.5 text-sm leading-relaxed text-zinc-950 shadow-[0_8px_24px_-10px_rgba(3,234,188,0.6)]">
                        {m.content}
                      </p>
                    </div>
                  ) : (
                    <div key={i} className="flex w-full items-start justify-start gap-2 animate-bubble-in">
                      <p className="max-w-[80%] whitespace-pre-wrap rounded-[20px] rounded-br-sm border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm leading-relaxed text-foreground">
                        {m.content}
                      </p>
                      {ttsSupported && (
                        <button
                          type="button"
                          onClick={() => speak(m.content)}
                          aria-label="إعادة الاستماع"
                          className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:bg-white/10 hover:text-primary"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ),
                )}
                {sending && (
                  <div className="flex w-full justify-start animate-bubble-in">
                    <div className="flex items-center gap-1.5 rounded-[20px] rounded-br-sm border border-white/10 bg-white/[0.05] px-4 py-3">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:120ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:240ms]" />
                    </div>
                  </div>
                )}
              </div>

              {error && <p className="relative z-10 px-6 pb-2 text-right text-xs text-red-400">{error}</p>}

              {/* Composer */}
              <div className="relative z-10 border-t border-white/10 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.9rem)]">
                <div className="flex items-center gap-1.5 rounded-[24px] border border-white/10 bg-white/[0.06] p-1.5 pr-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
                  {micSupported && (
                    <button
                      type="button"
                      onClick={toggleListening}
                      aria-label={listening ? "إيقاف الاستماع" : "التحدث صوتياً"}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all active:scale-90 ${
                        listening
                          ? "animate-pulse bg-red-500/20 text-red-400"
                          : "text-muted-foreground hover:bg-white/10 hover:text-primary"
                      }`}
                    >
                      {listening ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-4 w-4" />}
                    </button>
                  )}
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") send();
                    }}
                    placeholder={listening ? "أستمع إليك…" : "اكتب سؤالك أو تحدث…"}
                    disabled={sending}
                    className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={send}
                    disabled={sending || !input.trim()}
                    aria-label="إرسال"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[#0bc9a9] text-zinc-950 shadow-[0_6px_18px_-6px_rgba(3,234,188,0.8)] transition-all active:scale-90 disabled:opacity-40 disabled:shadow-none"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 rtl:-scale-x-100" />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}