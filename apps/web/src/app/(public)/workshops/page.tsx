import { CalendarFold } from "lucide-react";
import Link from "next/link";

import { WorkshopCard } from "@/components/cards/WorkshopCard";
import { EmptyState } from "@/components/EmptyState";
import ROUTES from "@/constants/routes";
import { FilterBar } from "@/features/workshop-browsing/components/FilterBar";
import { listWorkshopsServer } from "@/lib/api/server-services/catalog";
import type { WorkshopFilters } from "@/types/workshop";
import { WorkshopListWidget } from "@/widgets/WorkshopListWidget";

interface PageProps {
  searchParams: Promise<{
    day?: string;
    hasSeats?: string;
    sort?: string;
    q?: string;
    cursor?: string;
  }>;
}

/**
 * Public workshop listing page — async Server Component.
 *
 * Reads filter params from the URL (managed by FilterBar via router.replace),
 * fetches the paginated workshop list server-side, and renders it with the
 * slot-pattern WorkshopListWidget and compound WorkshopCard.
 *
 * @param searchParams - Resolved URL search params forwarded by Next.js App Router.
 * @returns A page with a filter bar and a grid of workshop cards, or an empty state.
 */
export default async function WorkshopsPage({ searchParams }: PageProps) {
  const raw = await searchParams;

  const filters: WorkshopFilters = {
    day: raw.day,
    hasSeats: raw.hasSeats === "true" ? true : undefined,
    sort: raw.sort,
    q: raw.q,
    cursor: raw.cursor,
  };

  const result = await listWorkshopsServer(filters);
  const workshops = result.isSuccess ? result.data.items : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <WorkshopListWidget
        header={
          <h1 className="text-2xl font-bold tracking-tight">
            Khám phá Workshop
          </h1>
        }
        filters={<FilterBar />}
        empty={
          <EmptyState
            icon={CalendarFold}
            title="Chưa có workshop nào"
            description="Hiện tại chưa có workshop phù hợp với bộ lọc của bạn. Hãy thử thay đổi điều kiện tìm kiếm."
          />
        }
      >
        {workshops.map((w) => (
          <Link key={w.id} href={ROUTES.WORKSHOP(w.id)} className="block">
            <WorkshopCard>
              <WorkshopCard.Header
                title={w.title}
                status={w.status}
                startsAt={w.startsAt}
                endsAt={w.endsAt}
              />
              <WorkshopCard.Meta
                speakerName={w.speaker?.fullName}
                speakerTitle={w.speaker?.title ?? undefined}
                speakerAvatarUrl={w.speaker?.avatarUrl ?? undefined}
              />
              <WorkshopCard.Footer
                roomName={w.room?.name}
                roomBuilding={w.room?.building ?? undefined}
                seatsAvailable={w.seatsAvailable}
                seatsTotal={w.seatsTotal}
                price={w.price}
              />
            </WorkshopCard>
          </Link>
        ))}
      </WorkshopListWidget>
    </div>
  );
}
