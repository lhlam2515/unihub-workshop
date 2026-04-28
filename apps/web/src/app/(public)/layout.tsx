import React from "react";

const PublicLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <main className="relative bg-white">
      <nav className="border-b p-4">Public Navbar Placeholder</nav>
      <section className="min-h-screen">{children}</section>
      <footer className="border-t p-4 text-center">Footer Placeholder</footer>
    </main>
  );
};

export default PublicLayout;
