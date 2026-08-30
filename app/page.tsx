'use client';

import { SiteHeader } from '@/components/site-header';
import { useLanguage } from '@/components/language-provider';
import { DocumentLink } from '@/components/document-link';
import { CommunityGallery } from '@/components/community-gallery';

export default function Home() {
  const { t } = useLanguage();
  return (
    <main className="landing-shell">
      <SiteHeader />

      <section className="home-start">
        <div className="home-intro">
          <h1>
            {t('taglineLead')} <span>{t('taglineAccent')}</span> {t('taglineTail')}
          </h1>
        </div>

        <div className="action-grid" aria-label={t('startPrompt')}>
          <DocumentLink className="action-card action-card-create" href="/create">
            <span className="action-index">01</span>
            <span className="action-label">{t('create')}</span>
            <span className="action-subtitle">{t('createSubtitle')}</span>
            <span className="action-arrow" aria-hidden="true">
              ↗
            </span>
          </DocumentLink>

          <DocumentLink className="action-card action-card-receive" href="/receive">
            <span className="action-index">02</span>
            <span className="action-label">{t('receive')}</span>
            <span className="action-subtitle">{t('receiveSubtitle')}</span>
            <span className="action-arrow" aria-hidden="true">
              ↗
            </span>
          </DocumentLink>
        </div>

        <CommunityGallery />
      </section>
    </main>
  );
}
