import type { WorkshopStatus } from "./workshop";

export interface TopWorkshopItem {
  id: string;
  title: string;
  fillRate: number;
  registrations: number;
  seatsTotal: number;
}

export interface CircuitBreakerState {
  paymentGateway: string;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failureCount: number;
  lastFailureAt: string | null;
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
