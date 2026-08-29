import { HandoffFlow } from '@/components/handoff-flow';

export default async function HandoffPage({
  params,
}: {
  params: Promise<{ handoffToken: string }>;
}) {
  const { handoffToken } = await params;
  return <HandoffFlow token={handoffToken} />;
}
