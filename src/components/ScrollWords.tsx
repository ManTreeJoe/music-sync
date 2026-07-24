'use client';

import { useEffect, useRef, useState } from 'react';

// The transfer flow as a Send-style AUTO-ROTATING word cycle: big red words that
// step through the stack on a timer, with a dot-matrix caption crossing the
// centre (over the sharp word), scrambling as it changes. Not scroll-driven.
const STAGES = [
  { w: 'Source', c: 'paste a public link' },
  { w: 'Match', c: 'ISRC first, then a tuned fuzzy pass' },
  { w: 'Destination', c: 'a new playlist — your final call' },
  { w: 'Export', c: 'CSV · JSON · M3U8, at any point' },
];
const N = STAGES.length;
const STEP_MS = 1500; // time held on each word
const SCRAMBLE = '▪▫—/#*<>[]';

/** Signed offset of word i from the continuous phase, wrapped to (-N/2, N/2]. */
function wrappedOffset(i: number, phase: number): number {
  let off = (((i - phase) % N) + N) % N; // 0..N
  if (off > N / 2) off -= N;
  return off;
}

export function ScrollWords() {
  const sectionRef = useRef<HTMLElement>(null);
  const phaseRef = useRef(0);
  const targetRef = useRef(0);
  const [phase, setPhase] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [caption, setCaption] = useState(STAGES[0].c);

  const activeIndex = ((Math.round(phase) % N) + N) % N;

  // Auto-rotate: step the target every STEP_MS, ease the phase toward it each
  // frame. Paused while the section is off-screen.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReduced(true);
      return;
    }
    const el = sectionRef.current;
    let raf = 0;
    let interval = 0;
    let running = false;

    const tick = () => {
      const diff = targetRef.current - phaseRef.current;
      phaseRef.current += diff * 0.14;
      if (Math.abs(diff) < 0.0004) phaseRef.current = targetRef.current;
      setPhase(phaseRef.current);
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
      interval = window.setInterval(() => {
        targetRef.current += 1;
      }, STEP_MS);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
      clearInterval(interval);
    };

    const io = new IntersectionObserver(
      (entries) => (entries[0].isIntersecting ? start() : stop()),
      { threshold: 0.2 },
    );
    if (el) io.observe(el);
    return () => {
      stop();
      io.disconnect();
    };
  }, []);

  // Scramble the caption in when the active word changes (dot-matrix flip).
  useEffect(() => {
    const target = STAGES[activeIndex]?.c ?? '';
    if (reduced) {
      setCaption(target);
      return;
    }
    const steps = 9;
    let frame = 0;
    const id = setInterval(() => {
      frame++;
      const revealed = Math.floor((frame / steps) * target.length);
      setCaption(
        target
          .split('')
          .map((ch, i) =>
            ch === ' ' || i < revealed
              ? ch
              : SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)],
          )
          .join(''),
      );
      if (frame >= steps) {
        clearInterval(id);
        setCaption(target);
      }
    }, 32);
    return () => clearInterval(id);
  }, [activeIndex, reduced]);

  // Reduced motion: a plain readable list, no animation.
  if (reduced) {
    return (
      <section className="sw-static wrap" aria-label="How a transfer flows">
        {STAGES.map((s) => (
          <div className="sw-static-row" key={s.w}>
            <span className="sw-static-word">{s.w}</span>
            <span className="sw-static-cap">{s.c}</span>
          </div>
        ))}
      </section>
    );
  }

  return (
    <section className="scroll-words" ref={sectionRef} aria-label="How a transfer flows">
      <div className="sw-stage">
        <div className="sw-glow" aria-hidden="true" />
        <div className="sw-words" aria-hidden="true">
          {STAGES.map((s, i) => {
            const off = wrappedOffset(i, phase);
            const abs = Math.abs(off);
            return (
              <div
                key={s.w}
                className="sw-word"
                style={{
                  transform: `translate(-50%, -50%) translateY(${off * 0.6}em) scale(${1 - Math.min(abs * 0.07, 0.22)})`,
                  filter: `blur(${Math.min(abs * 3.5, 9)}px)`,
                  opacity: Math.max(0.06, 1 - abs * 0.72),
                  zIndex: N - Math.round(abs),
                }}
              >
                {s.w}
              </div>
            );
          })}
        </div>
        {/* caption crosses the centre, over the sharp word */}
        <p className="sw-caption">{caption}</p>
        <span className="sw-index">
          {String(activeIndex + 1).padStart(2, '0')} / {String(N).padStart(2, '0')}
        </span>
      </div>
    </section>
  );
}
