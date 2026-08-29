import { z } from 'zod';
import { apiError, apiJson } from '@/lib/server/api';
import { requireAdmin } from '@/lib/server/admin-auth';
import { deleteAdminJourney } from '@/lib/server/admin-repository';

const deleteSchema = z.object({ expectedUpdatedAt: z.number().int().positive() });

export async function DELETE(
  request: Request,
  context: { params: Promise<{ journeyId: string }> },
) {
  try {
    await requireAdmin(request, true);
    const { journeyId } = await context.params;
    const input = deleteSchema.parse(await request.json());
    return apiJson(await deleteAdminJourney(journeyId, input.expectedUpdatedAt));
  } catch (error) {
    return apiError(error);
  }
}
