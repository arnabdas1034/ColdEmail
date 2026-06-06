import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your campaign stats will appear here once you start sending.
        </p>
      </div>

      {/* Placeholder — replaced in T6.7 with real stats */}
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-900">No campaigns yet</p>
        <p className="mt-1 text-sm text-gray-500">
          Get started by creating your first campaign.
        </p>
        <Link
          href="/dashboard/campaigns"
          className="mt-5 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Create campaign →
        </Link>
      </div>
    </div>
  );
}
