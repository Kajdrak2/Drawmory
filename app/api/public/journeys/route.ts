import { z } from 'zod';
import { apiError, apiJson } from '@/lib/server/api';
import { listPublicJourneys } from '@/lib/server/repository';

const listSchema = z.object({
  status: z.enum(['all', 'completed', 'in_progress']).default('all'),
  sort: z.enum(['random', 'newest', 'oldest', 'progress', 'votes', 'distance']).default('random'),
  limit: z.coerce.number().int().min(1).max(24).default(12),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = listSchema.parse({
      status: url.searchParams.get('status') ?? undefined,
      sort: url.searchParams.get('sort') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    });
    return apiJson({ items: await listPublicJourneys(input) });
  } catch (error) {
    return apiError(error);
  }
}
