import { z } from 'zod';

export const drawingLocationSchema = z
  .object({
    countryCode: z.string().trim().length(2).optional().nullable(),
    city: z.string().trim().max(80).optional().nullable(),
    latitude: z.number().finite().min(-90).max(90).optional().nullable(),
    longitude: z.number().finite().min(-180).max(180).optional().nullable(),
  })
  .refine(
    (location) =>
      (location.latitude == null && location.longitude == null) ||
      (location.latitude != null && location.longitude != null),
    { message: 'Latitude and longitude must be provided together.' },
  )
  .refine(
    (location) => !location.city?.trim() || Boolean(location.countryCode?.trim()),
    { message: 'Choose a country before adding a city.' },
  );
