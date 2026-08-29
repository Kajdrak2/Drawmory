import { apiError, apiJson } from '@/lib/server/api';
import { getClaimState } from '@/lib/server/repository';

export async function GET(
  request: Request,
  context: { params: Promise<{ claimId: string }> },
) {
  try {
    const { claimId } = await context.params;
    return apiJson(await getClaimState(request, claimId));
  } catch (error) {
    return apiError(error);
  }
}
