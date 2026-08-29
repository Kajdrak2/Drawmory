import { z } from 'zod';
import { apiError, apiJson } from '@/lib/server/api';
import { createJourney } from '@/lib/server/repository';

const createJourneySchema = z.object({
  imageDataUrl: z.string().min(100).max(1_500_000),
  targetRedraws: z.union([z.literal(3), z.literal(5)]),
});

export async function POST(request: Request) {
  try {
    const input = createJourneySchema.parse(await request.json());
    return apiJson(await createJourney(request, input.imageDataUrl, input.targetRedraws), {
      status: 201,
    });
  } catch (error) {
    return apiError(error);
  }
}
