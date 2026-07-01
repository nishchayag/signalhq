import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle, Lock, Mail, Trash2 } from "lucide-react";

const faqs = [
  {
    icon: <Lock className="text-primary w-5 h-5 mr-2 shrink-0" />,
    question: "Is SignalHQ really anonymous?",
    answer:
      "Yes, all messages you receive through your link are completely anonymous unless the sender chooses to identify themselves.",
  },
  {
    icon: <Mail className="text-primary w-5 h-5 mr-2 shrink-0" />,
    question: "Can I disable receiving messages?",
    answer:
      "Absolutely. You can toggle message reception anytime from your dashboard settings.",
  },
  {
    icon: <HelpCircle className="text-primary w-5 h-5 mr-2 shrink-0" />,
    question: "Is there a limit to how many messages I can receive?",
    answer:
      "No, there's no cap. You can receive unlimited feedback as long as you keep your account active.",
  },
  {
    icon: <Trash2 className="text-primary w-5 h-5 mr-2 shrink-0" />,
    question: "Can I report inappropriate messages?",
    answer:
      "We're working on moderation features. For now, you can delete any message you find inappropriate from your dashboard.",
  },
];

export default function FAQSection() {
  return (
    <section className="relative border-t border-border bg-muted/30 py-24 px-6">
      <div className="max-w-5xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-foreground">
          Frequently asked questions
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto mb-12 text-lg">
          Find quick answers to the most common questions about using SignalHQ.
        </p>
      </div>

      <div className="max-w-3xl mx-auto rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <Accordion type="multiple" className="space-y-3">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="rounded-xl border border-border px-1 transition hover:border-primary/40"
            >
              <AccordionTrigger className="text-left text-base font-medium text-foreground px-3 py-4 flex items-center gap-2 hover:no-underline rounded-md">
                {faq.icon}
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-4 text-muted-foreground text-sm">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
