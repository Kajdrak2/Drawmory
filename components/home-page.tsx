'use client';

import { SiteHeader } from '@/components/site-header';
import { useLanguage } from '@/components/language-provider';
import { DocumentLink } from '@/components/document-link';
import { CommunityGallery, type JourneyCardData } from '@/components/community-gallery';

export function HomePage({
  initialLibrary,
  initialHall,
}: {
  initialLibrary: JourneyCardData[];
  initialHall: JourneyCardData[];
}) {
  const { t } = useLanguage();
  return (
    <main className="landing-shell">
      <SiteHeader />

      <section className="home-start">
        <h1 className="sr-only">Drawmory</h1>

        <div className="action-grid" aria-label={t('startPrompt')}>
          <DocumentLink className="action-card action-card-create" href="/create" aria-label={t('create')}>
            <span className="action-index">01</span>
            <span className="action-label">{t('create')}</span>
            <span className="action-arrow" aria-hidden="true">
              ↗
            </span>
          </DocumentLink>

          <DocumentLink className="action-card action-card-receive" href="/receive" aria-label={t('receive')}>
            <span className="action-index">02</span>
            <span className="action-label">{t('receive')}</span>
            <span className="action-arrow" aria-hidden="true">
              ↗
            </span>
          </DocumentLink>
        </div>

        <CommunityGallery initialLibrary={initialLibrary} initialHall={initialHall} />
      </section>
    </main>
  );
}
