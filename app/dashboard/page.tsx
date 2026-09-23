"use client";
import { useEffect, useState } from "react";
import { Menu, Plus } from "lucide-react";
import CreateQuestionDialog from "@/components/CreateQuestionDialog";
import { PageLoader } from "@/components/Loader";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import DashboardSidebar from "./_components/DashboardSidebar";
import GeneralMessagesView from "./_components/GeneralMessagesView";
import QuestionView from "./_components/QuestionView";
import { useDashboardData, type DashboardData } from "./_components/useDashboardData";

export default function DashboardPage() {
  const d = useDashboardData();
  const [menuOpen, setMenuOpen] = useState(false);

  // A sheet left open while the window grows past `md` would keep Radix's
  // body pointer-events lock on the desktop layout — close it instead.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMenuOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (d.loading) {
    return <PageLoader label="Loading your dashboard…" />;
  }

  // Same sidebar inside the mobile sheet, but picking anything closes it.
  const sheetD: DashboardData = {
    ...d,
    handleGeneralView: () => {
      setMenuOpen(false);
      d.handleGeneralView();
    },
    handleQuestionSelect: (q) => {
      setMenuOpen(false);
      d.handleQuestionSelect(q);
    },
    setShowCreateDialog: (open) => {
      setMenuOpen(false);
      d.setShowCreateDialog(open);
    },
  };

  const viewTitle =
    d.view === "question" && d.selectedQuestion ? d.selectedQuestion.questionText : "General messages";

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      {/* Mobile toolbar: the sidebar (questions, org switcher, settings) is
          hidden below md, so it opens in a sheet from here instead. */}
      <div className="sticky top-16 z-30 flex items-center gap-2 border-b-2 border-ink bg-card px-4 py-2 md:hidden">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" aria-label="Open dashboard menu">
              <Menu className="mr-1.5 h-4 w-4" />
              Menu
            </Button>
          </SheetTrigger>
          <SheetContent title="Dashboard menu">
            <DashboardSidebar d={sheetD} />
          </SheetContent>
        </Sheet>
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{viewTitle}</p>
        <Button size="sm" onClick={() => d.setShowCreateDialog(true)} aria-label="New question">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-80 shrink-0 overflow-y-auto border-r-2 border-ink bg-card md:block">
          <DashboardSidebar d={d} />
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
            {d.view === "general" ? (
              <GeneralMessagesView d={d} />
            ) : d.selectedQuestion ? (
              <QuestionView d={d} question={d.selectedQuestion} />
            ) : null}
          </div>
        </main>
      </div>

      {/* Rendered at page level, never inside the sheet, so opening it from
          the sheet can't be torn down by the sheet closing. */}
      <CreateQuestionDialog
        open={d.showCreateDialog}
        onOpenChange={d.setShowCreateDialog}
        onQuestionCreated={d.handleQuestionCreated}
      />
      <CreateQuestionDialog
        open={d.editingQuestion !== null}
        onOpenChange={(open) => !open && d.setEditingQuestion(null)}
        question={d.editingQuestion}
        onQuestionUpdated={d.handleQuestionUpdated}
      />
    </div>
  );
}
