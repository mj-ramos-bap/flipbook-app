import FlipbookViewer from "./_components/flipbook-viewer";

export default function ViewPage({ params, searchParams }: { params: { uuid: string }; searchParams: { t?: string } }) {
  return <FlipbookViewer uuid={params?.uuid ?? ""} token={searchParams?.t} />;
}
