import { CarryFlow } from '@/components/carry-flow';

export default async function CarryPage({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params;
  return <CarryFlow claimId={claimId} />;
}
