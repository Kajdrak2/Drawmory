import { z } from 'zod';
import { apiError, apiJson } from '@/lib/server/api';
import { requireAdmin } from '@/lib/server/admin-auth';
import { releaseAdminClaim } from '@/lib/server/admin-repository';

const releaseSchema = z.object({ expectedUpdatedAt: z.number().int().positive() });

export async function POST(
  request: Request,
  context: { params: Promise<{ journeyId: string }> },
) {
  try {
    await requireAdmin(request, true);
    const { journeyId } = await context.params;
    const input = releaseSchema.parse(await request.json());
    return apiJson(await releaseAdminClaim(journeyId, input.expectedUpdatedAt));
  } catch (error) {
    return apiError(error);
  }
}
