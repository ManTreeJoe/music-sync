'use client';

import { useEffect, useRef, useState } from 'react';

// The transfer flow as a Send-style scroll section: big blurred red words
// stacked and cycled by scroll, with a dot-matrix caption crossing THROUGH the
// centre (over the sharp word), scrambling as it changes.
const STAGES = [
  { w: 'Source', c: 'paste a public link' },
  { w: 'Match', c: 'ISRC first, then a tuned fuzzy pass' },
  { w: 'Destination', c: 'a new playlist — your final call' },
  { w: 'Export', c: 'CSV · JSON · M3U8, at any point' },
];

const SCRAMBLE = '▪▫—/#*<>[]';

export function ScrollWords() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const idxRef = useRef(0);
  const [progress, setProgress] = useState(0); // fractional 0..n-1 (drives motion)
  const [wordIndex, setWordIndex] = useState(0); // stable index (drives caption)
  const [reduced, setReduced] = useState(false);
  const [caption, setCaption] = useState(STAGES[0].c);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReduced(true);
      return;
    }
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = wrapRef.current;
        if (!el) return;
        const total = el.offsetHeight - window.innerHeight;
        const scrolled = -el.getBoundingClientRect().top;
        const p = total > 0 ? Math.min(1, Math.max(0, scrolled / total)) : 0;
        const prog = p * (STAGES.length - 1);
        setProgress(prog);

        // Hysteresis: only switch words once clearly past the midpoint (0.6),
        // so jitter around the boundary can't flip-flop the caption.
        let idx = idxRef.current;
        while (idx < STAGES.length - 1 && prog > idx + 0.6) idx++;
        while (idx > 0 && prog < idx - 0.6) idx--;
        if (idx !== idxRef.current) {
          idxRef.current = idx;
          setWordIndex(idx);
        }
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // Scramble the caption in when the settled word changes (dot-matrix flip).
  useEffect(() => {
    const target = STAGES[wordIndex]?.c ?? '';
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
  }, [wordIndex, reduced]);

  // Reduced motion: a plain readable list.
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
    <section
      className="scroll-words"
      ref={wrapRef}
      style={{ height: `${STAGES.length * 85}vh` }}
      aria-label="How a transfer flows"
    >
      <div className="sw-stage">
        <div className="sw-words" aria-hidden="true">
          {STAGES.map((s, i) => {
            const dist = i - progress;
            const abs = Math.abs(dist);
            return (
              <div
                key={s.w}
                className="sw-word"
                style={{
                  transform: `translate(-50%, -50%) translateY(${dist * 0.72}em) scale(${1 - Math.min(abs * 0.06, 0.2)})`,
                  filter: `blur(${Math.min(abs * 4.5, 12)}px)`,
                  opacity: Math.max(0.3, 1 - abs * 0.4),
                  zIndex: STAGES.length - Math.round(abs),
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
          {String(wordIndex + 1).padStart(2, '0')} / {String(STAGES.length).padStart(2, '0')}
        </span>
      </div>
    </section>
  );
}
