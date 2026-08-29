import countries from 'world-countries';
import { DrawingLocationInput, JourneyLocation, hasLocationInput } from '@/lib/location';

const countriesByCode = new Map(countries.map((country) => [country.cca2, country]));

function finiteCoordinate(value: number | null | undefined, minimum: number, maximum: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

export function normalizeDrawingLocation(
  input?: DrawingLocationInput | null,
  fallback?: JourneyLocation | null,
): JourneyLocation {
  if (!hasLocationInput(input)) {
    return fallback ?? {
      countryCode: 'UNKNOWN',
      city: null,
      latitude: null,
      longitude: null,
      locationPrecision: 'NONE',
    };
  }

  const requestedCode = input?.countryCode?.trim().toUpperCase() ?? '';
  const country = countriesByCode.get(requestedCode);
  const countryCode = country?.cca2 ?? 'UNKNOWN';
  const city = input?.city?.trim().slice(0, 80) || null;
  const latitude = finiteCoordinate(input?.latitude, -90, 90);
  const longitude = finiteCoordinate(input?.longitude, -180, 180);

  if (latitude !== null && longitude !== null) {
    return { countryCode, city, latitude, longitude, locationPrecision: 'PRECISE' };
  }

  if (country) {
    return {
      countryCode,
      city,
      latitude: country.latlng[0],
      longitude: country.latlng[1],
      locationPrecision: 'COUNTRY',
    };
  }

  return { countryCode, city, latitude: null, longitude: null, locationPrecision: 'NONE' };
}
