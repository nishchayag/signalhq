"use client";
import Link from "next/link";
import { HelpCircle, MessageSquare, Plus, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import OrgSwitcher from "@/components/OrgSwitcher";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import type { DashboardData } from "./useDashboardData";

/** Org switcher, settings links, general-messages entry and question list. */
export default function DashboardSidebar({ d }: { d: DashboardData }) {
  return (
    <>
      <div className="border-b-2 border-ink p-5">
        <h1 className="text-lg font-black tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Manage your feedback</p>
      </div>

      {/* Organization switcher + management */}
      <div className="space-y-2 border-b-2 border-ink p-4">
        <OrgSwitcher />
        <Link
          href="/dashboard/organization"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
          Organization settings
        </Link>
        <Link
          href="/dashboard/account"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <User className="h-4 w-4" />
          Account settings
        </Link>
      </div>

      <div className="p-4">
        {/* General messages */}
        <button
          onClick={d.handleGeneralView}
          className={`mb-6 w-full rounded-xl border-2 p-3 text-left transition-colors ${
            d.view === "general"
              ? "border-ink bg-brand-yellow text-ink shadow-solid-sm"
              : "border-transparent hover:bg-secondary"
          }`}
        >
          <div className="flex items-center">
            <MessageSquare className="mr-3 h-5 w-5" />
            <div className="font-bold">General messages</div>
          </div>
        </button>

        {/* Questions */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Questions</h2>
          <Button onClick={() => d.setShowCreateDialog(true)} size="sm" className="h-8 px-3">
            <Plus className="mr-1 h-4 w-4" />
            New
          </Button>
        </div>

        {d.teamsError && (
          <p className="mb-3 text-xs font-medium text-destructive">
            {d.teamsError}.{" "}
            <button onClick={d.retryTeams} className="font-bold underline">
              Retry
            </button>
          </p>
        )}

        {d.teams.length > 0 && (
          <select
            value={d.teamFilter}
            onChange={(e) => d.setTeamFilter(e.target.value)}
            className="mb-3 w-full rounded-lg border-2 border-ink bg-card px-2 py-1.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All teams</option>
            <option value="none">Organization-wide</option>
            {d.teams.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>
        )}

        <div className="space-y-1.5">
          {d.filteredQuestions.map((question) => (
            <button
              key={question._id}
              onClick={() => d.handleQuestionSelect(question)}
              className={`w-full rounded-xl border-2 p-3 text-left transition-colors ${
                d.selectedQuestion?._id === question._id
                  ? "border-ink bg-brand-mint shadow-solid-sm"
                  : "border-transparent hover:bg-secondary"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex min-w-0 flex-1 items-start">
                  <HelpCircle className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className="truncate text-sm font-bold text-foreground">{question.questionText}</div>
                      {question.visibility === "internal" && (
                        <span className="shrink-0 rounded border border-ink bg-brand-blue/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-foreground">
                          Internal
                        </span>
                      )}
                    </div>
                    {(question.visibility !== "internal" || d.canViewAllReplies) && (
                      <div className="mt-1 text-xs font-medium text-muted-foreground">
                        {question.responseCount} responses
                      </div>
                    )}
                    {d.teams.length > 0 && (
                      <div className="mt-0.5 text-[10px] font-medium text-muted-foreground/70">
                        {question.teamId
                          ? d.teamNameById[String(question.teamId)] || "Team"
                          : "Organization-wide"}
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center">
                      <span
                        className={`mr-2 h-2 w-2 rounded-full border border-ink ${
                          question.isActive ? "bg-emerald-500" : "bg-muted-foreground/50"
                        }`}
                      />
                      <span className="text-xs font-medium text-muted-foreground">
                        {question.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </button>
          ))}

          {d.questionsError ? (
            <ErrorState compact message={d.questionsError} onRetry={d.retryQuestions} />
          ) : d.filteredQuestions.length === 0 && (
            <EmptyState
              compact
              icon={HelpCircle}
              title="No questions yet"
              description="Create your first question to get started"
            />
          )}
        </div>
      </div>
    </>
  );
}
