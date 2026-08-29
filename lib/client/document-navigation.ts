'use client';

/**
 * Uses a full-page navigation so post-action redirects do not depend on RSC prefetching.
 */
export function navigateTo(href: string) {
  window.location.assign(href);
}
