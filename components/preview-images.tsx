'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';

// Keep neighbouring image elements decoded and mounted, without persistent caching.
// Only visible cards prefetch; hidden NSFW URLs must be removed by the caller.
export function PreviewImages({ urls, activeIndex }: {
  urls: Array<string | null>;
  activeIndex: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const slideCount = urls.length + 1; // the last slide is the map
  const neighbours = new Set([
    activeIndex,
    (activeIndex + 1) % slideCount,
    (activeIndex - 1 + slideCount) % slideCount,
  ]);
  return (
    <div ref={container} className="preview-images" aria-hidden="true">
      {urls.map((url, index) => url && (index === activeIndex || (visible && neighbours.has(index))) ? (
        <img
          key={url}
          src={url}
          alt=""
          loading={visible ? 'eager' : 'lazy'}
          decoding="async"
          style={{ visibility: index === activeIndex ? 'visible' : 'hidden' }}
        />
      ) : null)}
    </div>
  );
}
