import { PublicHeaderWidget } from "@/widgets/PublicHeaderWidget";

import type { ReactNode } from "react";

const PublicLayout = ({ children }: { children: ReactNode }) => {
  return (
    <>
      <PublicHeaderWidget />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {children}
      </main>
    </>
  );
};

export default PublicLayout;
