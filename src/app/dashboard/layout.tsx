import { createClient } from "@/utils/supabase/server";
import { NavLinks } from "@/components/nav/NavLinks";
import { SignOutButton } from "@/components/nav/SignOutButton";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
        {/* Wordmark */}
        <div className="flex h-14 items-center border-b border-gray-200 px-5">
          <span className="text-sm font-semibold tracking-tight text-gray-900">
            Cold Email
          </span>
        </div>

        {/* Navigation links — client component (needs usePathname) */}
        <nav className="flex-1 px-3 py-4">
          <NavLinks />
        </nav>

        {/* User email + sign-out */}
        <div className="border-t border-gray-200 px-4 py-4">
          <p className="truncate text-xs text-gray-500">{user?.email ?? ""}</p>
          <SignOutButton />
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
