import { apiError } from '@/lib/server/api';
import { requireAdmin } from '@/lib/server/admin-auth';
import { getAdminDrawing } from '@/lib/server/admin-repository';

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
