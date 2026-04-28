import React from "react";

const StudentLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <main className="relative bg-white">
      <nav className="border-b p-4">Student Navbar</nav>
      <div className="flex">
        <aside className="min-h-screen w-64 border-r bg-gray-50 p-4">
          Student Menu Placeholder
        </aside>
        <section className="flex-1 bg-gray-50/50">{children}</section>
      </div>
    </main>
  );
};

export default StudentLayout;
