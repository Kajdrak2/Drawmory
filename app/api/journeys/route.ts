import { z } from 'zod';
import { apiError, apiJson } from '@/lib/server/api';
import { createJourney } from '@/lib/server/repository';
import { drawingLocationSchema } from '@/lib/server/validation';

const createJourneySchema = z.object({
  imageDataUrl: z.string().min(100).max(1_500_000),
  targetParticipants: z.union([z.number().int().min(2).max(50), z.literal('infinite')]),
  location: drawingLocationSchema.optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const input = createJourneySchema.parse(await request.json());
    return apiJson(await createJourney(input.imageDataUrl, input.targetParticipants, input.location), {
      status: 201,
    });
  } catch (error) {
    return apiError(error);
  }
}
