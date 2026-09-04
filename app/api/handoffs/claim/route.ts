import { z } from 'zod';
import { apiError, apiJson } from '@/lib/server/api';
import { claimCookie, claimHandoff } from '@/lib/server/repository';

const claimSchema = z
  .object({
    token: z.string().min(20).max(200).optional(),
    code: z.string().min(4).max(32).optional(),
    includeNsfw: z.boolean().default(false),
  })
  .refine((value) => Boolean(value.token) !== Boolean(value.code), {
    message: 'Provide one invitation token or one manual code.',
  });

export async function POST(request: Request) {
  try {
    const input = claimSchema.parse(await request.json());
    const result = await claimHandoff(input, input.includeNsfw);
    return apiJson(
      {
        claimId: result.claimId,
        reservationExpiresAt: result.reservationExpiresAt,
        revealSeconds: result.revealSeconds,
        redrawSeconds: result.redrawSeconds,
      },
      { headers: { 'Set-Cookie': claimCookie(result.claimId, result.sessionToken) } },
    );
  } catch (error) {
    return apiError(error);
  }
}
