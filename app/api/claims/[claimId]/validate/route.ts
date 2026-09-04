import { z } from 'zod';
import { apiError, apiJson } from '@/lib/server/api';
import { validateClaimDrawing } from '@/lib/server/repository';

const validateSchema = z.object({
  imageDataUrl: z.string().min(100).max(1_500_000),
  isNsfw: z.boolean().default(false),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ claimId: string }> },
) {
  try {
    const { claimId } = await context.params;
    const input = validateSchema.parse(await request.json());
    return apiJson(await validateClaimDrawing(request, claimId, input.imageDataUrl, input.isNsfw), {
      status: 201,
    });
  } catch (error) {
    return apiError(error);
  }
}
