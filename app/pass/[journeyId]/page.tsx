import { PassFlow } from '@/components/pass-flow';

export default async function PassPage({
  params,
}: {
  params: Promise<{ journeyId: string }>;
}) {
  const { journeyId } = await params;
  return <PassFlow journeyId={journeyId} />;
}
