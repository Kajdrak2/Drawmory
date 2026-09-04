'use client';

import { useLanguage } from './language-provider';

export function NsfwField({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <label className="nsfw-field">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        data-testid="mark-nsfw"
      />
      <span className="nsfw-checkbox" aria-hidden="true" />
      <span>
        <strong>{t('markNsfw')}</strong>
        <small>{t('markNsfwHint')}</small>
      </span>
    </label>
  );
}

export function NsfwPlaceholder({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage();
  return (
    <div className={`nsfw-placeholder${compact ? ' nsfw-placeholder-compact' : ''}`} role="img" aria-label={t('nsfwHidden')}>
      <span className="nsfw-badge">NSFW</span>
      <strong>{t('nsfwHidden')}</strong>
      {compact ? null : <p>{t('nsfwHiddenBody')}</p>}
    </div>
  );
}
