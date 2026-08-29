import { z } from 'zod';
import { apiError, apiJson } from '@/lib/server/api';
import { requireAdmin } from '@/lib/server/admin-auth';
import { resetAdminJourney } from '@/lib/server/admin-repository';

const resetSchema = z.object({
  expectedUpdatedAt: z.number().int().positive(),
  fromStep: z.number().int().min(1).max(50),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ journeyId: string }> },
) {
  try {
    await requireAdmin(request, true);
    const { journeyId } = await context.params;
    const input = resetSchema.parse(await request.json());
    return apiJson(await resetAdminJourney(journeyId, input.fromStep, input.expectedUpdatedAt));
  } catch (error) {
    return apiError(error);
  }
}
