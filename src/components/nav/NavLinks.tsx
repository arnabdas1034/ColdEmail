"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
  /**
   * When true, only mark active on an exact pathname match.
   * When false/undefined, also mark active for any sub-route
   * (e.g. /dashboard/campaigns/[id] highlights "Campaigns").
   */
  exact?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", exact: true },
  { label: "Campaigns", href: "/dashboard/campaigns" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <ul className="space-y-1">
      {NAV_ITEMS.map(({ label, href, exact }) => {
        const isActive =
          exact === true
            ? pathname === href
            : pathname === href || pathname.startsWith(href + "/");

        return (
          <li key={href}>
            <Link
              href={href}
              className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-blue-50 font-medium text-blue-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
