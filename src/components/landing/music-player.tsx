"use client";

import { forwardRef, useImperativeHandle, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as RPointerEvent } from "react";
import { Film, Music, Pause, Play, Plus, SkipBack, SkipForward, Square, X } from "lucide-react";

interface Track {
  id: string;
  name: string;
  url: string;
  fromVideo?: boolean;
}

export interface MusicPlayerHandle {
  open: () => void;
  pick: () => void;
  close: () => void;
}

export default forwardRef<MusicPlayerHandle, object>(function MusicPlayer(_props, ref) {
  const [visible, setVisible] = useState(true);
  const [collapsed, setCollapsed] = useState(true);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tracksRef = useRef<Track[]>([]);
  const currentIdRef = useRef<string | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const idleRef = useRef<number | null>(null);
  const movedRef = useRef(false);
  const closeRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [overClose, setOverClose] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 16, y: 16 });

  /* The lazy initializer can't be trusted after SSR hydration (the server-rendered
     value wins), so nudge the floating icon into its starting spot once, on the
     client, right before paint. */
  useLayoutEffect(() => {
    setPos({ x: 16, y: 16 });
  }, []);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    currentIdRef.current = currentId;
  }, [currentId]);

  /* Auto-collapse the open player back to the floating note after 5s of idling. */
  useEffect(() => {
    if (!visible || collapsed) return;
    idleRef.current = window.setTimeout(() => setCollapsed(true), 5000);
    return () => {
      if (idleRef.current) window.clearTimeout(idleRef.current);
    };
  }, [visible, collapsed]);

  const current = tracks.find((t) => t.id === currentId) ?? null;

  /* Keep the <audio> element mounted forever — playback survives the bar
     being hidden and stays reachable across the 3D view transitions. */
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setProgress(a.currentTime);
    const onMeta = () => setDuration(a.duration || 0);
    const onEnd = () => {
      const list = tracksRef.current;
      const idx = list.findIndex((t) => t.id === currentIdRef.current);
      const nxt = list[(idx + 1) % list.length];
      if (nxt) {
        setCurrentId(nxt.id);
        setPlaying(true);
      }
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  /* Apply play/pause whenever the track or playing state changes. */
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.play().catch(() => setPlaying(false));
    } else {
      a.pause();
    }
  }, [currentId, playing]);

  /* Revoke the object URLs and stop audio on unmount. */
  useEffect(() => {
    const a = audioRef.current;
    return () => {
      if (a) a.pause();
      for (const t of tracksRef.current) URL.revokeObjectURL(t.url);
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        setVisible(true);
        setCollapsed(false);
      },
      pick: () => {
        setVisible(true);
        setCollapsed(false);
        if (fileRef.current) setTimeout(() => fileRef.current?.click(), 60);
      },
      close: () => setVisible(false),
    }),
    [],
  );

  const togglePlay = () => {
    if (!current) return;
    setPlaying((p) => !p);
  };

  const stop = () => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setProgress(0);
    setPlaying(false);
  };

  const skip = (dir: 1 | -1) => {
    const list = tracks;
    if (!list.length) return;
    const idx = list.findIndex((t) => t.id === currentId);
    const nxt = list[(idx + dir + list.length) % list.length];
    setCurrentId(nxt?.id ?? list[0].id);
    setPlaying(true);
    setProgress(0);
  };

  const onFiles = (list: FileList | null) => {
    if (!list || !list.length) return;
    const next: Track[] = [];
    for (const f of Array.from(list)) {
      const isAudio = f.type.startsWith("audio/");
      const isVideo = f.type.startsWith("video/");
      if (!isAudio && !isVideo) continue;
      next.push({
        id: `${f.name}-${f.size}-${Date.now()}`,
        name: f.name.replace(/\.[^.]+$/, ""),
        url: URL.createObjectURL(f),
        fromVideo: isVideo,
      });
    }
    if (!next.length) return;
    setTracks((prev) => [...prev, ...next]);
    setCurrentId(next[0].id);
    setPlaying(true);
    setProgress(0);
  };

  const pct = duration > 0 ? Math.min((progress / duration) * 100, 100) : 0;

  const bumpIdle = () => {
    /* Interacting with the open player rolls the 5s auto-collapse timer over. */
    if (!visible || collapsed) return;
    if (idleRef.current) window.clearTimeout(idleRef.current);
    idleRef.current = window.setTimeout(() => setCollapsed(true), 5000);
  };

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    bumpIdle();
    /* Don't hijack presses that land on interactive controls — the bar is
       draggable from its empty areas; buttons must keep their clicks. */
    if (e.target instanceof Element && e.target.closest("button, input, video, select, a")) return;
    movedRef.current = false;
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: RPointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    bumpIdle();
    movedRef.current = true;
    const isIcon = collapsed;
    const w = isIcon ? 40 : Math.min(window.innerWidth - 24, 448);
    const h = isIcon ? 40 : 64;
    const x = Math.min(Math.max(12, e.clientX - d.dx), Math.max(12, window.innerWidth - w - 12));
    const y = Math.min(Math.max(12, e.clientY - d.dy), Math.max(12, window.innerHeight - h - 12));
    setPos({ x, y });
    if (isIcon) setOverClose(isOverClose(e.clientX, e.clientY));
  };

  const isOverClose = (x: number, y: number) => {
    const el = closeRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const endIconDrag = (e: RPointerEvent<HTMLButtonElement>) => {
    dragRef.current = null;
    const wasOver = isOverClose(e.clientX, e.clientY);
    setDragging(false);
    setOverClose(false);
    if (wasOver) {
      /* Dropping the note on the trash bin stops playback but keeps the
         launcher icon around. */
      stop();
      setVisible(false);
      setCollapsed(false);
    }
  };

  const swallowAfterDrag = () => {
    if (movedRef.current) {
      movedRef.current = false;
      return true;
    }
    return false;
  };

  const onIconPointerDown = (e: RPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    bumpIdle();
    movedRef.current = false;
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <video ref={audioRef} src={current?.url} preload="auto" className="hidden" />

      {visible && (
        <div dir="rtl" className="pointer-events-none fixed inset-0 z-[75] player-wrap">
          {/* Floating note — always mounted so it can cross-fade with the bar */}
          <button
            type="button"
            onClickCapture={(e) => {
              if (swallowAfterDrag()) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            onClick={() => {
              bumpIdle();
              setCollapsed(false);
            }}
            onPointerDown={onIconPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endIconDrag}
            onPointerCancel={endIconDrag}
            aria-label="فتح المشغّل الصوتي"
            className={`pointer-events-auto absolute left-0 top-0 flex h-10 w-10 cursor-grab touch-none select-none items-center justify-center rounded-full transition-all duration-500 ease-out active:cursor-grabbing ${
              collapsed ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-75"
            }`}
            style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
          >
            <Music
              className="pointer-events-none h-5 w-5 text-primary drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
              style={{ filter: "drop-shadow(0 0 12px rgba(3,234,188,0.35))" }}
            />
            {playing && (
              <span className="pointer-events-none absolute -bottom-0.5 -left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary shadow-[0_0_10px_rgba(3,234,188,0.9)]">
                <span className="flex h-3 items-end gap-[2px]" aria-hidden>
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="w-[2px] origin-bottom rounded-full bg-zinc-950 animate-[soundbar_0.9s_ease-in-out_infinite]"
                      style={{ height: d === 1 ? 9 : 6, animationDelay: `${d * 110}ms` }}
                    />
                  ))}
                </span>
              </span>
            )}
          </button>

          {/* Expanded mini player */}
          <div
            onClickCapture={(e) => {
              if (swallowAfterDrag()) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className={`pointer-events-auto absolute left-0 top-0 w-[min(calc(100vw-1.5rem),28rem)] select-none overflow-hidden rounded-[22px] border border-white/10 bg-background/90 shadow-[0_10px_40px_-8px_rgba(3,234,188,0.25),0_20px_44px_-12px_rgba(0,0,0,0.6)] backdrop-blur-2xl cursor-grab active:cursor-grabbing touch-none transition-all duration-500 ease-out ${
              collapsed ? "pointer-events-none opacity-0 scale-90" : "opacity-100 scale-100"
            }`}
            style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
          >
            {/* top sheen */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(120%_100%_at_50%_0%,rgba(168,85,247,0.1),transparent_70%)]" />

            <div className="relative flex items-center gap-2 p-2 pr-3">
              {/* Add music */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="إضافة موسيقى من الجهاز"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary transition-all hover:bg-primary/25 active:scale-90"
              >
                <Plus className="h-4 w-4" />
              </button>

              {/* Track info */}
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${current ? (playing ? "animate-disc-spin" : "") : ""}`}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#3a3a42,#101014_70%)]">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-[#0263D1]/80">
                      <Music className="h-3 w-3 text-zinc-950" />
                    </div>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-xs font-bold text-foreground">
                    <span className="truncate">{current ? current.name : "المشغّل الصوتي"}</span>
                    {current?.fromVideo && (
                      <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-fuchsia-500/15 px-1.5 py-[1px] text-[9px] font-medium text-fuchsia-400">
                        <Film className="h-2.5 w-2.5" />
                        مستخرج من فيديو
                      </span>
                    )}
                  </p>
                  <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {current ? (
                      playing ? (
                        <>
                          <span className="flex h-2.5 items-end gap-[2px]" aria-hidden>
                            {[0, 1, 2].map((d) => (
                              <span
                                key={d}
                                className="w-[2px] origin-bottom rounded-full bg-primary animate-[soundbar_1s_ease-in-out_infinite]"
                                style={{ height: d === 1 ? 10 : 7, animationDelay: `${d * 120}ms` }}
                              />
                            ))}
                          </span>
                          يعمل الآن…
                        </>
                      ) : (
                        "متوقف"
                      )
                    ) : (
                      "أضف موسيقى أو اختر فيديو لاستخراج صوته"
                    )}
                  </p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => skip(-1)}
                  disabled={!tracks.length}
                  aria-label="المقطع السابق"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-white/10 hover:text-primary active:scale-90 disabled:opacity-30"
                >
                  <SkipBack className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={togglePlay}
                  disabled={!current}
                  aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[#0bc9a9] text-zinc-950 shadow-[0_6px_18px_-6px_rgba(3,234,188,0.8)] transition-all hover:brightness-110 active:scale-90 disabled:opacity-40 disabled:shadow-none"
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
                </button>

                <button
                  type="button"
                  onClick={stop}
                  disabled={!current}
                  aria-label="إيقاف وإرجاع البداية"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-white/10 hover:text-primary active:scale-90 disabled:opacity-30"
                >
                  <Square className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => skip(1)}
                  disabled={!tracks.length}
                  aria-label="المقطع التالي"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-white/10 hover:text-primary active:scale-90 disabled:opacity-30"
                >
                  <SkipForward className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  aria-label="إخفاء المشغّل"
                  className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:bg-white/10 hover:text-muted-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Progress hairline */}
            {current && (
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/[0.06]">
                <div
                  className="h-full bg-gradient-to-l from-primary to-[#0bc9a9] transition-[width] duration-200 ease-linear"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>

          {dragging && (
            <div
              ref={closeRef}
              dir="ltr"
              className={`pointer-events-none absolute inset-x-0 bottom-4 flex h-24 items-center justify-center transition-opacity ${overClose ? "opacity-100" : "opacity-80"}`}
            >
              <div
                className={`flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed transition-all ${
                  overClose
                    ? "scale-110 border-red-400 bg-red-500/30 text-red-300 shadow-[0_0_26px_rgba(239,68,68,0.65)]"
                    : "border-red-400/40 bg-red-500/10 text-red-400/70"
                }`}
              >
                <X className="h-7 w-7" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reopen launcher — shown only once the note has been dropped to close.
          The collapsed icon is the everyday entry point; this is the escape hatch
          after a full close, mirrored left so it won't fight the dock's rail. */}
      {!visible && (
        <button
          type="button"
          aria-label="فتح المشغّل الصوتي"
          className="pointer-events-auto fixed bottom-20 left-4 z-[75] flex h-10 w-10 items-center justify-center rounded-full border border-primary/25 bg-background/90 shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-transform duration-300 hover:scale-105 active:scale-95 outline-none [-webkit-tap-highlight-color:transparent]"
          onClick={() => {
            setVisible(true);
            setCollapsed(false);
          }}
        >
          <Music className="h-5 w-5 text-primary" />
        </button>
      )}
    </>
  );
});