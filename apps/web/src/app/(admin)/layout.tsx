import React from "react";

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <main className="relative bg-white">
      <nav className="border-b bg-slate-900 p-4 text-white">Admin Topbar</nav>
      <div className="flex">
        <aside className="min-h-screen w-64 border-r bg-slate-800 p-4 text-slate-300">
          Admin Sidebar Placeholder
        </aside>
        <section className="flex-1 bg-slate-100">{children}</section>
      </div>
    </main>
  );
};

export default AdminLayout;
