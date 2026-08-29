import { z } from 'zod';
import { apiError, apiJson } from '@/lib/server/api';
import { chooseHandoff } from '@/lib/server/repository';

const handoffSchema = z.object({
  receiptToken: z.string().min(20).max(200),
  mode: z.enum(['PRIVATE', 'WORLD']),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ journeyId: string }> },
) {
  try {
    const { journeyId } = await context.params;
    const input = handoffSchema.parse(await request.json());
    return apiJson(await chooseHandoff(journeyId, input.receiptToken, input.mode));
  } catch (error) {
    return apiError(error);
  }
}
