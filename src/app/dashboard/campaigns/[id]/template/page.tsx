import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { TemplateEditor } from "@/components/template/TemplateEditor";

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("campaigns")
    .select("id, name, template_subject, template_body, ai_prompt")
    .eq("id", id)
    .single();

  if (!data) notFound();

  return (
    <div className="p-8">
      <nav className="mb-6">
        <Link
          href={`/dashboard/campaigns/${id}`}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← {data.name}
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Template</h1>
        <p className="mt-1 text-sm text-gray-500">
          Write your email subject and body. Use{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">
            {"{variables}"}
          </code>{" "}
          for personalization — the live preview shows example values.
        </p>
      </header>

      <TemplateEditor
        campaignId={id}
        initialSubject={data.template_subject ?? ""}
        initialBody={data.template_body ?? ""}
        initialAiPrompt={data.ai_prompt ?? ""}
      />
    </div>
  );
}
