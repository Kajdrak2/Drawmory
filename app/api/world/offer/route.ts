import { apiError, apiJson } from '@/lib/server/api';
import { createWorldOffer } from '@/lib/server/repository';

export async function POST() {
  try {
    const offer = await createWorldOffer();
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
