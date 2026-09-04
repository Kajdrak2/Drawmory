import { z } from 'zod';
import { apiError, apiJson } from '@/lib/server/api';
import { createWorldOffer } from '@/lib/server/repository';

const offerSchema = z.object({ includeNsfw: z.boolean().default(false) });

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const input = offerSchema.parse(body ? JSON.parse(body) : {});
    const offer = await createWorldOffer(input.includeNsfw);
    return offer
      ? apiJson(offer, { status: 201 })
      : apiJson(
          { error: 'The world is quiet right now.', code: 'WORLD_QUEUE_EMPTY' },
          { status: 404 },
        );
  } catch (error) {
    return apiError(error);
  }
}
