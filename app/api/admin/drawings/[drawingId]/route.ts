import { z } from 'zod';
import { apiError, apiJson } from '@/lib/server/api';
import { requireAdmin } from '@/lib/server/admin-auth';
import { getAdminDrawing, setAdminDrawingNsfw } from '@/lib/server/admin-repository';

const updateSchema = z.object({
  isNsfw: z.boolean(),
  expectedUpdatedAt: z.number().int().positive(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ drawingId: string }> },
) {
  try {
    await requireAdmin(request);
    const { drawingId } = await context.params;
    const image = await getAdminDrawing(drawingId);
    return new Response(image.body, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': image.mimeType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ drawingId: string }> },
) {
  try {
    await requireAdmin(request, true);
    const { drawingId } = await context.params;
    const input = updateSchema.parse(await request.json());
    return apiJson(await setAdminDrawingNsfw(drawingId, input.isNsfw, input.expectedUpdatedAt));
  } catch (error) {
    return apiError(error);
  }
}
