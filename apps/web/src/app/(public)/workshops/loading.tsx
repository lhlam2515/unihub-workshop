import { ContentLoader } from "@/components/ContentLoader";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <ContentLoader layout="grid" count={6} />
    </div>
  );
}
