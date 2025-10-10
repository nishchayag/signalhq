"use client";
import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  MessageSquare,
  HelpCircle,
  Copy,
  ExternalLink,
  Trash2,
  Power,
  PowerOff,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { IQuestion } from "@/models/question.model";
import { IMessage } from "@/models/message.model";
import MessageCard from "@/components/MessageCard";
import CreateQuestionDialog from "@/components/CreateQuestionDialog";

export default function DashboardPage() {
  const { data: session } = useSession();
  const [questions, setQuestions] = useState<IQuestion[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<IQuestion | null>(
    null
  );
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [generalMessages, setGeneralMessages] = useState<IMessage[]>([]);
  const [view, setView] = useState<"general" | "question">("general");

  useEffect(() => {
    if (session) {
      fetchQuestions();
      fetchGeneralMessages();
    }
  }, [session]);

  const fetchQuestions = async () => {
    try {
      const response = await axios.get("/api/questions");
      if (response.data.success) {
        setQuestions(response.data.questions);
      }
    } catch (error) {
      console.error("Error fetching questions:", error);
      toast.error("Failed to load questions");
    } finally {
      setLoading(false);
    }
  };

  const fetchGeneralMessages = async () => {
    try {
      const response = await axios.get("/api/getMessages");
      if (response.data.success) {
        // Filter general messages (without questionId)
        const generalMsgs = response.data.messages.filter(
          (msg: IMessage) => !msg.questionId
        );
        setGeneralMessages(generalMsgs);
      }
    } catch (error) {
      console.error("Error fetching general messages:", error);
    }
  };

  const fetchQuestionMessages = async (questionId: string) => {
    setMessagesLoading(true);
    try {
      const response = await axios.get(`/api/questions/${questionId}`);
      if (response.data.success) {
        setMessages(response.data.messages);
        setSelectedQuestion(response.data.question);
      }
    } catch (error) {
      console.error("Error fetching question messages:", error);
      toast.error("Failed to load messages");
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleQuestionSelect = (question: IQuestion) => {
    setSelectedQuestion(question);
    setView("question");
    fetchQuestionMessages(question._id);
  };

  const handleGeneralView = () => {
    setView("general");
    setSelectedQuestion(null);
    setMessages([]);
  };

  const copyQuestionLink = (slug: string) => {
    const link = `${window.location.origin}/q/${slug}`;
    navigator.clipboard.writeText(link);
    toast.success("Question link copied to clipboard!");
  };

  const handleDeleteMessage = (messageId: string) => {
    if (view === "general") {
      setGeneralMessages(
        generalMessages.filter((msg) => msg._id !== messageId)
      );
    } else {
      setMessages(messages.filter((msg) => msg._id !== messageId));
    }
  };

  const handleQuestionCreated = (newQuestion: IQuestion) => {
    setQuestions([newQuestion, ...questions]);
    setShowCreateDialog(false);
    toast.success("Question created successfully!");
  };

  const handleToggleActive = async (
    questionId: string,
    currentStatus: boolean
  ) => {
    try {
      const response = await axios.patch(`/api/questions/${questionId}`, {
        isActive: !currentStatus,
      });

      if (response.data.success) {
        setQuestions(
          questions.map((q) =>
            q._id === questionId
              ? ({ ...q, isActive: !currentStatus } as IQuestion)
              : q
          )
        );
        toast.success(
          `Question ${!currentStatus ? "activated" : "deactivated"} successfully`
        );
      } else {
        toast.error("Failed to update question status");
      }
    } catch (error) {
      console.error("Error toggling question status:", error);
      toast.error("Failed to update question status");
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this question? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      const response = await axios.delete(`/api/questions/${questionId}`);

      if (response.data.success) {
        setQuestions(questions.filter((q) => q._id !== questionId));
        if (selectedQuestion?._id === questionId) {
          setSelectedQuestion(null);
          setView("general");
        }
        toast.success("Question deleted successfully");
      } else {
        toast.error("Failed to delete question");
      }
    } catch (error) {
      console.error("Error deleting question:", error);
      toast.error("Failed to delete question");
    }
  };

  const handleRefreshQuestion = async (questionId: string) => {
    try {
      const response = await axios.get(`/api/questions/${questionId}`);
      if (response.data.success) {
        // Update the question's response count
        setQuestions(
          questions.map((q) =>
            q._id === questionId
              ? ({
                  ...q,
                  responseCount: response.data.question.responseCount,
                } as IQuestion)
              : q
          )
        );

        // If this question is currently selected, refresh its messages
        if (selectedQuestion?._id === questionId) {
          setMessages(response.data.messages);
        }

        toast.success("Question refreshed successfully");
      }
    } catch (error) {
      console.error("Error refreshing question:", error);
      toast.error("Failed to refresh question");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-80 bg-white border-r border-gray-200 h-screen overflow-y-auto">
          <div className="p-6 border-b border-gray-200">
            <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-600 mt-1">Manage your feedback</p>
          </div>

          <div className="p-4">
            {/* General Messages */}
            <div className="mb-6">
              <button
                onClick={handleGeneralView}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  view === "general"
                    ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                    : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center">
                  <MessageSquare className="h-5 w-5 mr-3" />
                  <div>
                    <div className="font-medium">General Messages</div>
                    <div className="text-xs text-gray-500">
                      {generalMessages.length} messages
                    </div>
                  </div>
                </div>
              </button>
            </div>

            {/* Questions Section */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-medium text-gray-900">Questions</h2>
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  size="sm"
                  className="h-8 px-3"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  New
                </Button>
              </div>

              <div className="space-y-2">
                {questions.map((question) => (
                  <button
                    key={question._id}
                    onClick={() => handleQuestionSelect(question)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedQuestion?._id === question._id
                        ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start min-w-0 flex-1">
                        <HelpCircle className="h-4 w-4 mr-2 mt-1 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">
                            {question.questionText}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {question.responseCount} responses
                          </div>
                          <div className="flex items-center mt-1">
                            <div
                              className={`h-2 w-2 rounded-full mr-2 ${
                                question.isActive
                                  ? "bg-green-400"
                                  : "bg-gray-400"
                              }`}
                            />
                            <span className="text-xs text-gray-500">
                              {question.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center space-x-1 ml-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleActive(question._id, question.isActive);
                          }}
                          className="h-8 w-8 p-0"
                          title={
                            question.isActive
                              ? "Deactivate question"
                              : "Activate question"
                          }
                        >
                          {question.isActive ? (
                            <PowerOff className="h-4 w-4 text-yellow-600" />
                          ) : (
                            <Power className="h-4 w-4 text-green-600" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRefreshQuestion(question._id);
                          }}
                          className="h-8 w-8 p-0"
                          title="Refresh question messages"
                        >
                          <RefreshCw className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteQuestion(question._id);
                          }}
                          className="h-8 w-8 p-0"
                          title="Delete question"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </button>
                ))}

                {questions.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <HelpCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm">No questions yet</p>
                    <p className="text-xs">
                      Create your first question to get started
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {view === "general" ? (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    General Messages
                  </h2>
                  <p className="text-gray-600">
                    Messages sent to your general feedback link
                  </p>
                </div>

                {/* General link sharing */}
                <Card className="mb-6">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">
                          Your General Feedback Link
                        </p>
                        <p className="text-sm text-gray-600">
                          Share this link to collect general feedback
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const link = `${window.location.origin}/u/${session?.user?.username}`;
                            navigator.clipboard.writeText(link);
                            toast.success("Link copied to clipboard!");
                          }}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Link
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            window.open(
                              `/u/${session?.user?.username}`,
                              "_blank"
                            );
                          }}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Preview
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Messages */}
                <div className="space-y-4">
                  {generalMessages.map((message) => (
                    <MessageCard
                      key={message._id as string}
                      message={message}
                      onMessageDelete={handleDeleteMessage}
                    />
                  ))}

                  {generalMessages.length === 0 && (
                    <div className="text-center py-12">
                      <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        No messages yet
                      </h3>
                      <p className="text-gray-600 mb-4">
                        Share your link to start receiving feedback
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : selectedQuestion ? (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {selectedQuestion.questionText}
                  </h2>
                  {selectedQuestion.description && (
                    <p className="text-gray-600 mb-4">
                      {selectedQuestion.description}
                    </p>
                  )}
                  <div className="flex gap-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyQuestionLink(selectedQuestion.slug)}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Link
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        window.open(`/q/${selectedQuestion.slug}`, "_blank")
                      }
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Preview
                    </Button>
                  </div>
                </div>

                {/* Messages */}
                <div className="space-y-4">
                  {messagesLoading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                    </div>
                  ) : (
                    <>
                      {messages.map((message) => (
                        <MessageCard
                          key={message._id as string}
                          message={message}
                          onMessageDelete={handleDeleteMessage}
                        />
                      ))}

                      {messages.length === 0 && (
                        <div className="text-center py-12">
                          <HelpCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                          <h3 className="text-lg font-medium text-gray-900 mb-2">
                            No responses yet
                          </h3>
                          <p className="text-gray-600 mb-4">
                            Share your question link to start collecting
                            responses
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Create Question Dialog */}
      <CreateQuestionDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onQuestionCreated={handleQuestionCreated}
      />
    </div>
  );
}
