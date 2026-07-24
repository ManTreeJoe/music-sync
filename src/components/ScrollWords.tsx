'use client';

import { useEffect, useRef, useState } from 'react';

// The transfer flow as a Send-style scroll section: big blurred red words
// stacked and cycled by scroll, with a dot-matrix caption. Same four stages as
// the old signal chain, now the signature moment.
const STAGES = [
  { w: 'Source', c: 'paste a public link' },
  { w: 'Match', c: 'ISRC first, then a tuned fuzzy pass' },
  { w: 'Destination', c: 'a new playlist — your final call' },
  { w: 'Export', c: 'CSV · JSON · M3U8, at any point' },
];

export function ScrollWords() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0); // fractional 0..n-1
  const [reduced, setReduced] = useState(false);

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
        setProgress(p * (STAGES.length - 1));
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

  // Reduced motion (or pre-hydration for those users): a plain readable list.
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

  const activeIndex = Math.round(progress);
  const capOpacity = Math.max(0, 1 - Math.abs(progress - activeIndex) * 2.4);

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
                  transform: `translateY(${dist * 0.72}em) scale(${1 - Math.min(abs * 0.07, 0.22)})`,
                  filter: `blur(${Math.min(abs * 6, 16)}px)`,
                  opacity: Math.max(0.12, 1 - abs * 0.52),
                  zIndex: STAGES.length - Math.round(abs),
                }}
              >
                {s.w}
              </div>
            );
          })}
        </div>
        <p className="sw-caption" style={{ opacity: capOpacity }}>
          {STAGES[activeIndex]?.c}
        </p>
        <span className="sw-index">
          {String(activeIndex + 1).padStart(2, '0')} / {String(STAGES.length).padStart(2, '0')}
        </span>
      </div>
    </section>
  );
}
