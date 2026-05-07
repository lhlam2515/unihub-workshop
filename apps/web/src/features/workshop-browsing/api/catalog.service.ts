/**
 * Re-export catalog service from the shared API layer.
 *
 * Feature services belong here to maintain the FSD boundary — importing
 * from `../../lib/api/services/catalog` would cross feature boundaries.
 */
export {
  listWorkshops,
  getWorkshopDetail,
  getWorkshopAvailability,
} from "@/lib/api/services/catalog";
