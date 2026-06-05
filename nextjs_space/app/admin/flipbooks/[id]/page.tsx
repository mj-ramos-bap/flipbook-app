import FlipbookDetail from "./_components/flipbook-detail";

export default function FlipbookDetailPage({ params }: { params: { id: string } }) {
  return <FlipbookDetail id={params?.id ?? ""} />;
}
