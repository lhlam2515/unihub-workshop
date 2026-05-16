import type { WorkshopStatus } from "./workshop";
import type { CircuitBreakerState } from "./admin-operations";

export interface TopWorkshopItem {
  id: string;
  title: string;
  fillRate: number;
  registrations: number;
  seatsTotal: number;
}

export interface DashboardOverview {
  workshopsByStatus: Record<WorkshopStatus, number>;
  totalWorkshops: number;
  totalRegistrations: number;
  avgFillRate: number;
  topHighestFillRate: TopWorkshopItem[];
  topLowestFillRate: TopWorkshopItem[];
  checkinRate: number;
  paidRevenue: { amount: number; currency: string };
  circuitBreaker: CircuitBreakerState | null;
  updatedAt: string;
}
