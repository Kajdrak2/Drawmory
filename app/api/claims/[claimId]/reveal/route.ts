import { apiError, apiJson } from '@/lib/server/api';
import { startReveal } from '@/lib/server/repository';

export async function POST(
  request: Request,
  context: { params: Promise<{ claimId: string }> },
) {
  try {
    const { claimId } = await context.params;
    return apiJson(await startReveal(request, claimId));
  } catch (error) {
    return apiError(error);
  }
}
