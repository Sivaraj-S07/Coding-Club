import { useState } from "react";
import { Menu } from "lucide-react";
import AdminSidebar, { AdminSidebarDrawer } from "./AdminSidebar";
import NotificationBell from "./NotificationBell";
import AdminNotificationBar from "./AdminNotificationBar";

export default function AdminLayout({ title, subtitle, actions, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <AdminSidebarDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b hairline bg-void/60 backdrop-blur-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5 lg:px-8">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                className="-ml-1 shrink-0 rounded-lg p-1.5 text-ink-300 hover:bg-white/10 hover:text-ink-100 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate font-display text-base font-semibold text-ink-100 sm:text-lg">{title}</h1>
                {subtitle && <p className="truncate text-xs text-ink-500">{subtitle}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <NotificationBell />
              {actions}
            </div>
          </div>
          <AdminNotificationBar />
        </header>
        <main className="px-4 py-6 sm:px-5 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
