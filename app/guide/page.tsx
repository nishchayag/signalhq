import Link from "next/link";
import Image from "next/image";
import {
  Rocket,
  UserPlus,
  Link2,
  MessageCircleQuestion,
  Inbox,
  Reply,
  Send,
  Building2,
  Shield,
  Users,
  Mail,
  CreditCard,
  Settings,
  Lightbulb,
  Repeat,
  Sparkles,
  BarChart3,
  Code2,
  Webhook,
} from "lucide-react";
import { generateMetadata as buildMetadata } from "@/lib/metadata";

export const generateMetadata = () =>
  buildMetadata({
    title: "User Guide",
    description:
      "How to use SignalHQ: feedback links, questions and pulse surveys, your inbox, anonymous conversations, AI assist, analytics, embedding, Slack and teams.",
    url: "/guide",
  });

/** Screenshot with the design system's sticker treatment + caption. */
function Screenshot({
  src,
  alt,
  width,
  height,
  caption,
  maxWidth,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption: string;
  maxWidth?: string;
}) {
  return (
    <figure className={maxWidth}>
      <div className="overflow-hidden rounded-xl border-2 border-ink shadow-solid">
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          className="h-auto w-full"
        />
      </div>
      <figcaption className="mt-2 text-xs font-medium text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

/** Inline "Pro" marker for features that need the Pro plan or above. */
function ProTag() {
  return (
    <span className="ml-1.5 inline-flex items-center rounded-md border-2 border-ink bg-brand-blue px-1.5 py-px align-middle text-[10px] font-black uppercase tracking-wide text-on-brand">
      Pro
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-secondary px-1 font-mono text-xs">{children}</code>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="text-foreground">{children}</strong>;
}

/**
 * Screenshot files in public/guide/ and their pixel sizes. Retaken with a
 * disposable demo org whenever the UI they show changes.
 */
const SHOTS = {
  shareLink: { src: "/guide/share-link.png", width: 896, height: 1120 },
  shareEmbed: { src: "/guide/share-embed.png", width: 896, height: 800 },
  createQuestion: { src: "/guide/create-question.png", width: 1040, height: 2188 },
  sidebar: { src: "/guide/dashboard-sidebar.png", width: 640, height: 1520 },
  inbox: { src: "/guide/inbox-triage.png", width: 1858, height: 1825 },
  thread: { src: "/guide/thread.png", width: 1390, height: 1472 },
  analytics: { src: "/guide/analytics.png", width: 2080, height: 3000 },
  receipt: { src: "/guide/reply-receipt.png", width: 1390, height: 740 },
  guard: { src: "/guide/anonymity-guard.png", width: 1344, height: 1520 },
};

/**
 * The whole guide is static content, structured as sections with anchor ids
 * so the table of contents (and external links) can deep-link into it.
 * Public page: listed in proxy.ts isPublicPage, viewable logged in or out.
 */
const SECTIONS: {
  id: string;
  chip: string;
  icon: React.ReactNode;
  heading: string;
  body: React.ReactNode;
}[] = [
  {
    id: "what-is-signalhq",
    chip: "bg-brand-yellow",
    icon: <Rocket className="h-4.5 w-4.5" />,
    heading: "What is SignalHQ?",
    body: (
      <>
        <p>
          SignalHQ is an anonymous feedback platform. You (or your
          organization) share a link; anyone who opens it can send you honest
          feedback without creating an account or revealing who they are. You
          read and triage everything in one inbox, ask focused questions
          (including ratings, NPS and recurring pulse surveys), keep an
          ongoing conversation with anonymous senders, and let AI surface the
          themes, all without ever learning who said what.
        </p>
        <p>
          There are two sides to SignalHQ, and this guide covers both:{" "}
          <B>receiving</B> feedback (needs an account) and <B>sending</B> it
          (never needs one).
        </p>
      </>
    ),
  },
  {
    id: "quick-start",
    chip: "bg-brand-mint",
    icon: <Lightbulb className="h-4.5 w-4.5" />,
    heading: "Quick start",
    body: (
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          <Link href="/signup" className="font-semibold underline">
            Sign up
          </Link>{" "}
          and verify your email with the 6-digit code we send you.
        </li>
        <li>
          Log in. You land on your dashboard with a personal organization
          already set up, and a short checklist to get you going.
        </li>
        <li>
          Hit <B>Share</B> on the dashboard to copy your organization&apos;s
          feedback link (or grab its QR code) and put it anywhere: Slack, an
          email signature, a slide, a poster.
        </li>
        <li>
          (Optional) Create a <em>question</em> to collect feedback on
          something specific. Each question gets its own shareable link.
        </li>
        <li>
          Watch responses arrive in your inbox, reply to the ones that need
          it, and check Analytics for the bigger picture.
        </li>
      </ol>
    ),
  },
  {
    id: "create-account",
    chip: "bg-brand-pink",
    icon: <UserPlus className="h-4.5 w-4.5" />,
    heading: "Creating your account",
    body: (
      <>
        <p>
          Signing up takes a username, your name, an email address, and a
          password:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <B>Usernames</B> are 4–20 characters: lowercase letters, numbers,
            and underscores. Typing uppercase is fine; we lowercase it for
            you, and <Code>Abc</Code> and <Code>abc</Code> are the same
            username. The signup form checks availability as you type.
          </li>
          <li>
            <B>Passwords</B> need at least 8 characters with an uppercase
            letter, a lowercase letter, a number, and a special character.
          </li>
          <li>
            <B>Email verification</B> is required before you can log in. We
            email you a 6-digit code that expires after 5 minutes; enter (or
            paste) it on the verify page and you&apos;re in. Closed the page
            by accident? Try logging in and you&apos;ll get a button to send
            a fresh code.
          </li>
        </ul>
        <p>
          Forgot your password? Use the reset link on the login page and
          we&apos;ll email you a code to set a new one. You can log in with
          either your email or your username.
        </p>
      </>
    ),
  },
  {
    id: "share-links",
    chip: "bg-brand-blue",
    icon: <Link2 className="h-4.5 w-4.5" />,
    heading: "Your feedback links",
    body: (
      <>
        <p>Every organization has shareable links that anyone can open:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <B>Organization page</B>: <Code>/o/your-org</Code>. Your public
            landing page, with a general feedback form and your open
            questions.
          </li>
          <li>
            <B>Question links</B>: <Code>/o/your-org/q/abc12345</Code>. Each
            public question gets its own link so you can ask about one
            specific thing.
          </li>
          <li>
            <B>Personal link</B>: <Code>/u/your-username</Code>. The original
            SignalHQ link; it still works and forwards visitors to your
            organization page.
          </li>
        </ul>
        <p>
          The <B>Share</B> button (on the dashboard, on each question, and on
          the organization page) copies the link, opens your phone&apos;s
          share sheet, or shows a <B>QR code</B> you can download as PNG or
          SVG for posters and slides. Links also unfurl with a proper preview
          card when you paste them into Slack, WhatsApp or social media.
        </p>
        <Screenshot
          {...SHOTS.shareLink}
          alt="The Share dialog with the organization feedback link, a copy button and a QR code"
          maxWidth="max-w-md"
          caption="Share copies your link or gives you a QR code for anything printed or on screen."
        />
        <p>
          Want feedback without sending people elsewhere? See{" "}
          <a href="#embed" className="font-semibold underline">
            embedding
          </a>{" "}
          to put the form right on your own website.
        </p>
      </>
    ),
  },
  {
    id: "questions",
    chip: "bg-brand-yellow",
    icon: <MessageCircleQuestion className="h-4.5 w-4.5" />,
    heading: "Questions",
    body: (
      <>
        <p>
          A question is a focused feedback prompt, like &ldquo;What should
          we change about our sprint process?&rdquo;, with its own link and
          its own set of responses. Create one from the dashboard with a
          prompt (up to 500 characters) and an optional description. Stuck
          for wording? <B>Suggest</B> drafts a few questions for you, and you
          can give it a focus to steer it.
        </p>
        <p>Pick a <B>Response type</B>:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <B>Text</B>: a free-form written answer (the default).
          </li>
          <li>
            <B>Rating</B>: 1–5, with optional labels for each end of the
            scale.
          </li>
          <li>
            <B>NPS</B>: the standard 0–10 &ldquo;how likely are you to
            recommend…&rdquo; score.
          </li>
          <li>
            <B>Single choice</B> or <B>multiple choice</B>: your own options,
            with an optional limit on how many can be picked.
          </li>
        </ul>
        <p>
          Scored and choice questions can still take an optional written
          comment. Once a question has its first response, its type and
          options are locked so earlier answers stay comparable.
        </p>
        <p>
          Two optional limits close a question automatically: a{" "}
          <B>close date</B>, and a <B>response cap</B> (it stops after that
          many answers). You can also switch a question off by hand at any
          time; nothing you&apos;ve already received is lost.
        </p>
        <p>Questions come in two visibilities:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <B>Public</B> (default): anyone with the link answers anonymously,
            no account needed.
          </li>
          <li>
            <B>Internal</B>: no public link at all. Only logged-in members of
            your organization can answer, and each member&apos;s answer
            becomes a private thread that only they and the org&apos;s
            owners/admins can see, never other members. Use this for
            check-ins, retros, or sensitive topics inside a team. (Internal
            answers aren&apos;t anonymous to owners and admins, since the
            person is logged in.)
          </li>
        </ul>
        <Screenshot
          {...SHOTS.createQuestion}
          alt="The Create question dialog with the response type set to a score"
          maxWidth="max-w-md"
          caption="Creating a question: pick who can answer, a response type, and optional close date or cap."
        />
      </>
    ),
  },
  {
    id: "pulse",
    chip: "bg-brand-mint",
    icon: <Repeat className="h-4.5 w-4.5" />,
    heading: "Pulse surveys",
    body: (
      <>
        <p>
          A pulse is a question that reopens on a schedule, such as a weekly
          team-health check or a monthly NPS. Turn on <B>Repeat</B> when
          creating a public question, choose <B>Weekly</B>,{" "}
          <B>Every 2 weeks</B> or <B>Monthly</B>, and a start date.
          <ProTag />
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Every round collects fresh answers, and the question&apos;s
            analytics show a <B>trend per round</B> (responses, and the
            average or NPS for scored questions).
          </li>
          <li>
            With reminders on, members of the organization (or just the
            question&apos;s team) get an email when a new round opens. People
            who turned email notifications off don&apos;t get them.
          </li>
          <li>
            The schedule locks after the first response. A pulse can&apos;t
            also have a response cap, and internal questions can&apos;t
            repeat.
          </li>
        </ul>
        <p>Only owners and admins can set up a pulse.</p>
      </>
    ),
  },
  {
    id: "inbox",
    chip: "bg-brand-pink",
    icon: <Inbox className="h-4.5 w-4.5" />,
    heading: "Your inbox",
    body: (
      <>
        <p>
          The dashboard is your inbox. The sidebar lists your questions;
          click one to see only its responses, and click it again to go back
          to general feedback. If you belong to several organizations, the
          switcher flips your whole view between them.
        </p>
        <p>To keep on top of things:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <B>Unread</B>: new messages are marked until <em>you</em> read
            them. Read state is per person, so a colleague opening a message
            doesn&apos;t mark it read for you. <B>Mark all read</B> clears the
            lot.
          </li>
          <li>
            <B>Archive</B> handled messages to get them out of the way. If the
            sender writes back, the conversation returns to your inbox as
            unread.
          </li>
          <li>
            <B>Labels</B> (like &ldquo;Bug&rdquo; or &ldquo;Idea&rdquo;) are
            defined per organization in the Labels tab, and{" "}
            <B>Assign to</B> hands a message to a teammate. Filter by label,
            by assignee, or by <B>Assigned to me</B>.
          </li>
          <li>
            <B>Search</B> matches exact words. Switch on <B>Semantic</B> to
            search by meaning instead, so &ldquo;burnout&rdquo; also finds
            &ldquo;I&apos;m exhausted every Friday&rdquo;.
          </li>
          <li>
            <B>Export CSV</B> takes a copy of the responses, including full
            conversations, into a spreadsheet.
          </li>
        </ul>
        <Screenshot
          {...SHOTS.inbox}
          alt="The dashboard inbox with unread, label and assignee filters, and messages showing label, tag and sentiment chips"
          caption="The inbox: filters across the top, with labels, AI tags and sentiment on each message."
        />
        <p>
          Owners and admins triage everything. Members can read what their
          teams can see, and can archive messages assigned to them.
        </p>
      </>
    ),
  },
  {
    id: "replying",
    chip: "bg-brand-blue",
    icon: <Reply className="h-4.5 w-4.5" />,
    heading: "Conversations with anonymous senders",
    body: (
      <>
        <p>
          Every message is a conversation. When someone sends feedback, they
          get a private receipt link. When you reply, your answer appears
          there, and they can write back from the same link. You can keep
          going back and forth while neither side learns anything about the
          other.
        </p>
        <p>
          Open any message to see the full thread. Messages waiting on your
          reply are flagged in the inbox. Not sure how to word a tricky
          response? Pick a tone (warm, neutral or brief), optionally say what
          to convey, and <B>Draft with AI</B> writes a starting point for you
          to edit. Nothing is sent until you hit send.
        </p>
        <Screenshot
          {...SHOTS.thread}
          alt="A message thread with the original feedback, an organization reply, a follow-up from the anonymous sender and the reply box"
          caption="A thread: the sender's follow-ups and your replies, in order."
        />
        <p>
          Replying speaks for your organization, so it&apos;s limited to
          owners and admins (see{" "}
          <a href="#roles" className="font-semibold underline">
            roles
          </a>
          ). Replies can&apos;t be edited or deleted once sent.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    chip: "bg-brand-yellow",
    icon: <Sparkles className="h-4.5 w-4.5" />,
    heading: "AI assist",
    body: (
      <>
        <p>
          SignalHQ uses AI to save you reading time. It never sees who sent a
          message, because SignalHQ doesn&apos;t know either.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <B>Tags and sentiment</B>: each new message gets a few topic tags
            and a positive / neutral / negative read, shown as chips in the
            inbox and usable as filters.
          </li>
          <li>
            <B>AI insights</B>: on a question, generate a summary of the main
            themes across its responses. Owners and admins can run it.
          </li>
          <li>
            <B>Safety flags</B>: messages that look abusive or that may
            contain personal details are flagged for owners and admins.
          </li>
          <li>
            <B>Draft with AI</B> for replies, <B>Suggest</B> for new
            questions, and <B>Semantic</B> search (all above).
          </li>
          <li>
            <B>Daily digest summary</B>: if you get the daily email, it can
            open with a few bullet points on what came in. Turn it off in
            account settings.
          </li>
        </ul>
        <p>
          AI features have monthly limits per organization that grow with your{" "}
          <a href="#plans" className="font-semibold underline">
            plan
          </a>
          . If a limit runs out, everything else keeps working; only the AI
          extras pause until next month.
        </p>
      </>
    ),
  },
  {
    id: "analytics",
    chip: "bg-brand-mint",
    icon: <BarChart3 className="h-4.5 w-4.5" />,
    heading: "Analytics",
    body: (
      <>
        <p>
          <B>Analytics</B> in the dashboard shows how feedback is trending
          across your organization: volume over time, sentiment, and the most
          common tags. Each question has its own breakdown too, such as the
          score distribution and average for ratings, the NPS split into
          detractors, passives and promoters, and how often each option was
          picked for choice questions.
        </p>
        <p>
          Pick a date range to zoom in, and click any bar or slice to jump to
          the messages behind it.
        </p>
        <Screenshot
          {...SHOTS.analytics}
          alt="The analytics page with response volume, sentiment and tag charts"
          caption="Analytics: click any chart segment to see the messages behind it."
        />
      </>
    ),
  },
  {
    id: "sending-feedback",
    chip: "bg-brand-pink",
    icon: <Send className="h-4.5 w-4.5" />,
    heading: "Sending feedback (no account needed)",
    body: (
      <>
        <p>
          Someone shared a SignalHQ link with you? Open it, write your
          message (or pick a score), and hit send. That&apos;s it: no
          account, no name, no email.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <B>You stay anonymous.</B> Recipients never see who sent a
            message. (We briefly keep limited technical data like IP
            addresses purely for rate limiting. It is never shown to
            recipients.)
          </li>
          <li>
            <B>Check before you send.</B> Small details (your role, a place,
            a date) can give you away. <B>Check for identifying details</B>{" "}
            points out anything risky and offers a safer rewording. It only
            runs when you click it, and your draft isn&apos;t stored.
            <Screenshot
              {...SHOTS.guard}
              alt="The feedback form after an identifying-details check, flagging a phrase and offering a safer rewrite"
              maxWidth="mt-3 max-w-xl"
              caption="The check flags details that could point back to you and suggests a safer version."
            />
          </li>
          <li>
            <B>Save your receipt.</B> After sending, you get a private link;
            bookmark it. Replies appear there, and you can write back from
            the same page. Lose the link and there&apos;s no way to recover
            the conversation (that&apos;s the price of anonymity).
            <Screenshot
              {...SHOTS.receipt}
              alt="The receipt card shown after sending anonymous feedback, with a private link and a Copy button"
              maxWidth="mt-3 max-w-xl"
              caption="Your receipt appears right after you send. This link is the only way back to the conversation."
            />
          </li>
          <li>
            <B>Be decent.</B> Clearly abusive, hateful, or threatening
            messages are blocked before they send, and submissions are
            rate-limited to deter spam.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "embed",
    chip: "bg-brand-blue",
    icon: <Code2 className="h-4.5 w-4.5" />,
    heading: "Embedding & branding",
    body: (
      <>
        <p>
          Put your feedback form straight onto your own website or help
          centre. In the Share dialog, switch to <B>Embed</B>, pick a
          light, dark or system theme, and paste the snippet into your page.
          It works for your organization page or a single question, resizes
          itself to fit, and senders stay just as anonymous as on your link.
        </p>
        <p>
          One caution: avoid embedding it on a page people must log in to
          (like a company intranet) if responders need to stay
          unidentifiable, since that page&apos;s owner knows who was there.
        </p>
        <Screenshot
          {...SHOTS.shareEmbed}
          alt="The Share dialog's Embed tab with a theme picker and a copyable script snippet"
          maxWidth="max-w-md"
          caption="Copy the embed snippet from the Share dialog."
        />
        <p>
          Embedding is free and shows a small &ldquo;Powered by
          SignalHQ&rdquo; badge; Pro removes it.
        </p>
        <p>
          <B>Branding</B>
          <ProTag /> makes your public pages look like yours: add your logo
          (PNG, JPEG or WebP, resized for you), choose an accent color, and
          write a short welcome message. Set it up in the organization&apos;s
          Branding tab, which shows a live preview. If you move back to Free,
          your branding is kept but hidden until you upgrade again.
        </p>
      </>
    ),
  },
  {
    id: "integrations",
    chip: "bg-brand-yellow",
    icon: <Webhook className="h-4.5 w-4.5" />,
    heading: "Slack & webhooks",
    body: (
      <>
        <p>
          Get new feedback where your team already works. In the
          organization&apos;s <B>Integrations</B> tab, owners and admins can
          connect up to five destinations:
          <ProTag />
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <B>Slack</B>: paste a Slack incoming-webhook URL and new messages
            post to that channel.
          </li>
          <li>
            <B>Webhook</B>: send events to your own endpoint. Each request is
            signed so you can verify it came from SignalHQ (the signing
            secret is shown once, when you create it).
          </li>
        </ul>
        <p>
          Choose which events to send (new messages, sender follow-ups) and
          the <B>Payload</B>: <B>Full</B> includes the message text, while{" "}
          <B>Nudge</B> just says something arrived, with a link to the
          dashboard. Answers to internal questions are never sent anywhere. A
          destination that keeps failing is switched off automatically and
          shows why.
        </p>
      </>
    ),
  },
  {
    id: "organizations",
    chip: "bg-brand-mint",
    icon: <Building2 className="h-4.5 w-4.5" />,
    heading: "Organizations",
    body: (
      <>
        <p>
          Everything in SignalHQ lives inside an organization. When you sign
          up, we create a personal one for you automatically: you&apos;re its
          owner, and your feedback links point at it. You can rename it, or
          create more organizations (a company, a side project, a community)
          from the organization switcher and hop between them.
        </p>
        <p>
          Each organization has its own <Code>/o/…</Code> link, members,
          teams, labels, questions, and messages. Nothing leaks between
          organizations. Its settings page has tabs for Members, Invitations,
          Teams, Labels, Branding, Integrations, Plan, Activity (a log of who
          changed what) and Settings.
        </p>
      </>
    ),
  },
  {
    id: "roles",
    chip: "bg-brand-pink",
    icon: <Shield className="h-4.5 w-4.5" />,
    heading: "Roles: Owner, Admin, Member",
    body: (
      <>
        <p>
          Your role is per organization: you can be the owner of your
          personal org and a plain member somewhere else.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-2 border-ink text-sm">
            <thead>
              <tr className="border-b-2 border-ink bg-secondary text-left">
                <th className="px-3 py-2 font-black">Can…</th>
                <th className="px-3 py-2 font-black">Owner</th>
                <th className="px-3 py-2 font-black">Admin</th>
                <th className="px-3 py-2 font-black">Member</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Create questions, read feedback their teams can see", "✓", "✓", "✓"],
                ["Answer internal questions", "✓", "✓", "✓"],
                ["Reply to anonymous senders", "✓", "✓", "—"],
                ["Label, assign, archive and delete messages", "✓", "✓", "—"],
                ["Run AI insights, see safety flags", "✓", "✓", "—"],
                ["See every member's internal-question thread", "✓", "✓", "—"],
                ["Set up pulses, branding and integrations", "✓", "✓", "—"],
                ["Manage teams, invite & remove members", "✓", "✓", "—"],
                ["Rename, delete or transfer the org, change its plan", "✓", "—", "—"],
              ].map(([label, o, a, m]) => (
                <tr key={label} className="border-b border-ink/20 last:border-0">
                  <td className="px-3 py-2 text-muted-foreground">{label}</td>
                  <td className="px-3 py-2 font-bold">{o}</td>
                  <td className="px-3 py-2 font-bold">{a}</td>
                  <td className="px-3 py-2 font-bold">{m}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Admins can&apos;t act on people at or above their own rank; only an
          owner can promote, demote, or remove an admin. An owner can hand
          the organization to someone else with <B>Transfer ownership</B>.
        </p>
      </>
    ),
  },
  {
    id: "teams",
    chip: "bg-brand-blue",
    icon: <Users className="h-4.5 w-4.5" />,
    heading: "Teams",
    body: (
      <>
        <p>
          Teams split a bigger organization into groups, such as Engineering,
          Design or Marketing, and a person can belong to several. Questions
          can be scoped to a team or left organization-wide.
        </p>
        <p>
          Scoping controls visibility: owners and admins see everything, but a
          member only sees organization-wide questions plus the ones scoped to
          teams they&apos;re actually in. A question for the Design team stays
          inside the Design team.
        </p>
        <Screenshot
          {...SHOTS.sidebar}
          alt="The dashboard sidebar listing questions, each marked organization-wide or with its team, and an Internal badge"
          maxWidth="max-w-[340px]"
          caption="Each question in the sidebar shows its scope and an Internal badge when it isn't publicly answerable."
        />
      </>
    ),
  },
  {
    id: "invitations",
    chip: "bg-brand-yellow",
    icon: <Mail className="h-4.5 w-4.5" />,
    heading: "Inviting people",
    body: (
      <>
        <p>
          Owners and admins invite people by email from the organization page,
          choosing their role (admin or member; ownership isn&apos;t granted
          by invite) and optionally dropping them straight into a team. The
          invitee gets an email with a single-use link; opening it shows the
          invitation, and they can accept with an existing account or sign up
          first. The invite survives the detour.
        </p>
        <p>
          Each person can have one live invitation per organization at a time,
          and pending invites can be revoked from the Invitations tab.
        </p>
      </>
    ),
  },
  {
    id: "plans",
    chip: "bg-brand-mint",
    icon: <CreditCard className="h-4.5 w-4.5" />,
    heading: "Plans",
    body: (
      <>
        <p>
          Plans are per organization. Feedback itself is never capped on any
          plan.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-2 border-ink text-sm">
            <thead>
              <tr className="border-b-2 border-ink bg-secondary text-left">
                <th className="px-3 py-2 font-black"></th>
                <th className="px-3 py-2 font-black">Free</th>
                <th className="px-3 py-2 font-black">Pro</th>
                <th className="px-3 py-2 font-black">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Teams", "2", "10", "Unlimited"],
                ["AI assist", "Monthly limits", "10× higher limits", "Unlimited"],
                ["Pulse surveys", "—", "✓", "✓"],
                ["Branding", "—", "✓", "✓"],
                ["Slack & webhooks", "—", "✓", "✓"],
                ["Embed without badge", "—", "✓", "✓"],
              ].map(([label, f, p, e]) => (
                <tr key={label} className="border-b border-ink/20 last:border-0">
                  <td className="px-3 py-2 text-muted-foreground">{label}</td>
                  <td className="px-3 py-2 font-bold">{f}</td>
                  <td className="px-3 py-2 font-bold">{p}</td>
                  <td className="px-3 py-2 font-bold">{e}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          SignalHQ is in early access, so every plan is currently free.
          Owners can switch tiers in the organization&apos;s Plan tab, and you
          can compare them any time on the{" "}
          <Link href="/pricing" className="font-semibold underline">
            pricing page
          </Link>
          . Moving down a plan never deletes anything: Pro-only extras are
          just paused.
        </p>
      </>
    ),
  },
  {
    id: "account",
    chip: "bg-brand-pink",
    icon: <Settings className="h-4.5 w-4.5" />,
    heading: "Notifications & account",
    body: (
      <>
        <p>
          <B>Notifications</B> (in account settings) control your email about
          new feedback: <B>immediately</B>, as one <B>daily</B> digest (the
          default), or <B>off</B>. The daily digest can open with an AI
          summary, which you can switch off. You can also mute a single
          organization without changing anything else. You&apos;re emailed
          when there&apos;s something for you: new messages in places you
          own or admin, or on questions you created.
        </p>
        <p>
          Account settings is also where you change your name or password
          (changing your password signs out every other device), see your
          current plan, and delete your account. Deleting your account
          removes organizations only you own. If an org you own still has
          other members, transfer ownership or remove them first, so a team
          never loses its workspace by surprise.
        </p>
      </>
    ),
  },
  {
    id: "tips",
    chip: "bg-brand-blue",
    icon: <Lightbulb className="h-4.5 w-4.5" />,
    heading: "Tips & shortcuts",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <B>Enter sends</B> in every composer; <B>Shift+Enter</B> adds a new
          line. (On phones, Enter just makes a new line as usual.)
        </li>
        <li>
          <B>Click a selected question again</B> in the dashboard sidebar to
          jump back to the general view.
        </li>
        <li>
          <B>Dark mode</B> lives behind the moon button in the navbar.
        </li>
        <li>
          Stuck or found a bug? Email{" "}
          <a
            href="mailto:nishchay.agar@gmail.com"
            className="font-semibold underline"
          >
            nishchay.agar@gmail.com
          </a>
          .
        </li>
      </ul>
    ),
  },
];

export default function GuidePage() {
  return (
    <div className="bg-background text-foreground">
      <div className="border-b-2 border-ink bg-dot-grid">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            The SignalHQ <span className="highlight">User Guide</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Everything from your first shared link to running feedback for a
            whole organization — whether you&apos;re collecting feedback or
            sending it.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-16">
        <nav
          aria-label="Guide contents"
          className="rounded-2xl border-2 border-ink bg-card p-6 shadow-solid"
        >
          <h2 className="text-sm font-black uppercase tracking-wide">
            On this page
          </h2>
          <ol className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="font-semibold text-muted-foreground transition-colors hover:text-primary"
                >
                  {i + 1}. {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article>
          {SECTIONS.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="mt-12 scroll-mt-24"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-ink text-on-brand shadow-solid-sm ${section.chip}`}
                >
                  {section.icon}
                </span>
                <h2 className="text-2xl font-black tracking-tight">
                  {section.heading}
                </h2>
              </div>
              <div className="mt-4 space-y-3 leading-relaxed text-muted-foreground">
                {section.body}
              </div>
            </section>
          ))}
        </article>

        <div className="mt-16 rounded-2xl border-2 border-ink bg-brand-yellow p-6 text-on-brand shadow-solid">
          <h2 className="text-xl font-black tracking-tight">
            Ready to try it?
          </h2>
          <p className="mt-1.5 text-sm font-medium">
            Your feedback link is two minutes away.
          </p>
          <Link
            href="/signup"
            className="pop mt-4 inline-flex items-center rounded-lg border-2 border-ink bg-card px-4 py-2 text-sm font-bold text-foreground"
          >
            Get started free
          </Link>
        </div>
      </div>
    </div>
  );
}
