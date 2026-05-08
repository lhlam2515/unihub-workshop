import { useCallback, useEffect, useState } from "react";

import handleError from "@/lib/handlers/error";

import { ticketsApi } from "../api/tickets.service";

import type { TicketDto } from "../api/tickets.service";

export interface UseMyTicketsResult {
  tickets: TicketDto[];
  isLoading: boolean;
  errorMessage: string | null;
  reload: () => Promise<void>;
}

export function useMyTickets(): UseMyTicketsResult {
  const [tickets, setTickets] = useState<TicketDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const result = await ticketsApi.getMyTickets();

    if (result.isFailure) {
      const appError = handleError(result.error);
      setErrorMessage(appError.message);
    } else {
      setTickets(result.data);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { tickets, isLoading, errorMessage, reload: load };
}
