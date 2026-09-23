"use client";
import CreateQuestionDialog from "@/components/CreateQuestionDialog";
import { PageLoader } from "@/components/Loader";
import DashboardSidebar from "./_components/DashboardSidebar";
import GeneralMessagesView from "./_components/GeneralMessagesView";
import QuestionView from "./_components/QuestionView";
import { useDashboardData } from "./_components/useDashboardData";

export default function DashboardPage() {
  const d = useDashboardData();

  if (d.loading) {
    return <PageLoader label="Loading your dashboard…" />;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="flex">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-80 shrink-0 overflow-y-auto border-r-2 border-ink bg-card md:block">
          <DashboardSidebar d={d} />
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-3xl p-6 lg:p-8">
            {d.view === "general" ? (
              <GeneralMessagesView d={d} />
            ) : d.selectedQuestion ? (
              <QuestionView d={d} question={d.selectedQuestion} />
            ) : null}
          </div>
        </main>
      </div>

      <CreateQuestionDialog
        open={d.showCreateDialog}
        onOpenChange={d.setShowCreateDialog}
        onQuestionCreated={d.handleQuestionCreated}
      />
    </div>
  );
}
