export type JourneyPoint = {
  latitude: number | null;
  longitude: number | null;
  locationPrecision?: string | null;
};

export type JourneyDistance = {
  distanceKm: number | null;
  approximate: boolean;
};

const EARTH_RADIUS_KM = 6371.0088;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function haversineDistanceKm(left: JourneyPoint, right: JourneyPoint) {
  if (
    left.latitude == null ||
    left.longitude == null ||
    right.latitude == null ||
    right.longitude == null
  ) {
    return null;
  }

  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const rawLongitudeDelta = right.longitude - left.longitude;
  const normalizedLongitudeDelta = ((rawLongitudeDelta + 540) % 360) - 180;
  const longitudeDelta = toRadians(normalizedLongitudeDelta);
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const halfChord =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(halfChord)));
}

export function measureJourney(points: JourneyPoint[]): JourneyDistance {
  let distanceKm = 0;
  let measuredSegments = 0;
  let approximate = false;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const segment = haversineDistanceKm(previous, current);
    if (segment == null) continue;

    distanceKm += segment;
    measuredSegments += 1;
    approximate ||= previous.locationPrecision === 'COUNTRY' || current.locationPrecision === 'COUNTRY';
  }

  return {
    distanceKm: measuredSegments > 0 ? distanceKm : null,
    approximate,
  };
}
