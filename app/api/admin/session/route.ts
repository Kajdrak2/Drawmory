import { z } from 'zod';
import { apiError, apiJson } from '@/lib/server/api';
import {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  requireAdmin,
  verifyAdminCapability,
} from '@/lib/server/admin-auth';

const sessionSchema = z.object({ capability: z.string().min(32).max(512) });

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return apiJson({ error: 'This administration request was rejected.' }, { status: 403 });
    }
    const { capability } = sessionSchema.parse(await request.json());
    await verifyAdminCapability(capability);
    return apiJson(
      { authenticated: true },
      { headers: { 'Set-Cookie': await createAdminSessionCookie() } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin(request, true);
    return apiJson(
      { authenticated: false },
      { headers: { 'Set-Cookie': clearAdminSessionCookie() } },
    );
  } catch (error) {
    return apiError(error);
  }
}
