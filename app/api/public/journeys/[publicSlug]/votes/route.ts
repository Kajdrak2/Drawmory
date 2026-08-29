import { z } from 'zod';
import { apiError, apiJson } from '@/lib/server/api';
import { voteForJourney } from '@/lib/server/repository';

const voteSchema = z.object({
  voterToken: z.string().min(16).max(128),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ publicSlug: string }> },
) {
  try {
    const { publicSlug } = await context.params;
    const input = voteSchema.parse(await request.json());
    return apiJson(await voteForJourney(publicSlug, input.voterToken));
  } catch (error) {
    return apiError(error);
  }
}
