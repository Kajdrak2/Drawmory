'use client';

import { useId, useMemo, useState } from 'react';
import countries from 'world-countries';
import type { DrawingLocationInput } from '@/lib/location';
import { useLanguage } from './language-provider';
import { getLanguageOption } from '@/lib/i18n';

export function LocationPicker({
  value,
  onChange,
  inheritsPrevious = false,
  cityRequiresCountry = false,
}: {
  value: DrawingLocationInput;
  onChange: (location: DrawingLocationInput) => void;
  inheritsPrevious?: boolean;
  cityRequiresCountry?: boolean;
}) {
  const { language, t } = useLanguage();
  const fieldId = useId();
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const locale = getLanguageOption(language).locale;
  const options = useMemo(
    () => {
      const displayNames = new Intl.DisplayNames([locale], { type: 'region' });
      return countries
        .map((country) => ({
          code: country.cca2,
          label: displayNames.of(country.cca2) ?? country.name.common,
        }))
        .sort((left, right) => left.label.localeCompare(right.label, locale));
    },
    [locale],
  );

  const usePosition = () => {
    if (!navigator.geolocation) {
      setMessage(t('locationUnavailable'));
      return;
    }
    setLocating(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          ...value,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocating(false);
        setMessage(t('positionSaved'));
      },
      () => {
        setLocating(false);
        setMessage(t('locationDeclined'));
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const hasValue = Boolean(value.countryCode || value.city || (value.latitude != null && value.longitude != null));

  return (
    <section className="location-panel" aria-labelledby="location-title">
      <div className="location-heading">
        <div>
          <p className="flow-kicker">{t('optional')}</p>
          <h2 id="location-title">{t('whereDrawing')}</h2>
          <p>{inheritsPrevious ? t('locationInheritance') : t('locationPrivacy')}</p>
        </div>
        <span className="location-pin" aria-hidden="true">⌖</span>
      </div>
      <div className="location-fields">
        <div className="location-field">
          <label htmlFor={`${fieldId}-country`}>{t('country')}</label>
          <select
            id={`${fieldId}-country`}
            value={value.countryCode ?? ''}
            onChange={(event) => {
              const countryCode = event.target.value || null;
              onChange({
                ...value,
                countryCode,
                city: cityRequiresCountry && !countryCode ? null : value.city,
              });
            }}
          >
            <option value="">{t('notSpecified')}</option>
            {options.map((country) => (
              <option key={country.code} value={country.code}>{country.label}</option>
            ))}
          </select>
        </div>
        <div className="location-field">
          <label htmlFor={`${fieldId}-city`}>{t('city')}</label>
          <input
            id={`${fieldId}-city`}
            type="text"
            value={value.city ?? ''}
            maxLength={80}
            placeholder={t('cityPlaceholder')}
            disabled={cityRequiresCountry && !value.countryCode}
            onChange={(event) => onChange({ ...value, city: event.target.value })}
          />
          {cityRequiresCountry && !value.countryCode ? <small>{t('chooseCountryFirst')}</small> : null}
        </div>
      </div>
      <div className="location-actions">
        <button className="secondary-button position-button" type="button" onClick={usePosition} disabled={locating}>
          {locating ? t('locating') : t('useMyPosition')}
        </button>
        {hasValue ? (
          <button className="quiet-action" type="button" onClick={() => { onChange({}); setMessage(null); }}>
            {inheritsPrevious ? t('inheritPrevious') : t('clearLocation')}
          </button>
        ) : null}
      </div>
      {message ? <p className="location-message" role="status">{message}</p> : null}
    </section>
  );
}
