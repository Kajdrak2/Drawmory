export type DrawingLocationInput = {
  countryCode?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type JourneyLocation = {
  countryCode: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  locationPrecision: 'NONE' | 'COUNTRY' | 'PRECISE';
};

export function hasLocationInput(location?: DrawingLocationInput | null) {
  if (!location) return false;
  return Boolean(
    location.countryCode?.trim() ||
      location.city?.trim() ||
      (Number.isFinite(location.latitude) && Number.isFinite(location.longitude)),
  );
}
