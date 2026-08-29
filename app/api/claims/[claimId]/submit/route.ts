import { z } from 'zod';
import { apiError, apiJson } from '@/lib/server/api';
import { submitRedraw } from '@/lib/server/repository';
import { drawingLocationSchema } from '@/lib/server/validation';

const submitSchema = z.object({
  imageDataUrl: z.string().min(100).max(1_500_000),
  location: drawingLocationSchema.optional().nullable(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ claimId: string }> },
) {
  try {
    const { claimId } = await context.params;
    const input = submitSchema.parse(await request.json());
    return apiJson(await submitRedraw(request, claimId, input.imageDataUrl, input.location), {
      status: 201,
    });
  } catch (error) {
    return apiError(error);
  }
}
