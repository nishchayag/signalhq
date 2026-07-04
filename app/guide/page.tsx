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
} from "lucide-react";
import { generateMetadata as buildMetadata } from "@/lib/metadata";

export const generateMetadata = () =>
  buildMetadata({
    title: "User Guide",
    description:
      "Everything you need to know to use SignalHQ — creating your account, sharing feedback links, questions, organizations, teams, roles, and replying to anonymous feedback.",
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
          read everything in one dashboard, organize feedback around specific
          questions, and can even reply to anonymous senders without ever
          learning their identity.
        </p>
        <p>
          There are two sides to SignalHQ, and this guide covers both:{" "}
          <strong className="text-foreground">receiving</strong> feedback
          (needs an account) and{" "}
          <strong className="text-foreground">sending</strong> it (never needs
          one).
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
          Log in — you land on your dashboard with a personal organization
          already set up.
        </li>
        <li>
          Copy your organization&apos;s feedback link from the dashboard and
          share it anywhere: Slack, email signature, social bio.
        </li>
        <li>
          (Optional) Create a <em>question</em> to collect feedback on
          something specific — each question gets its own shareable link.
        </li>
        <li>Watch responses arrive on your dashboard. That&apos;s it.</li>
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
            <strong className="text-foreground">Usernames</strong> are 4–20
            characters — lowercase letters, numbers, and underscores. Typing
            uppercase is fine; we lowercase it for you, and{" "}
            <code className="rounded bg-secondary px-1 font-mono text-xs">
              Abc
            </code>{" "}
            and{" "}
            <code className="rounded bg-secondary px-1 font-mono text-xs">
              abc
            </code>{" "}
            are the same username. The signup form checks availability as you
            type.
          </li>
          <li>
            <strong className="text-foreground">Passwords</strong> need at
            least 8 characters with an uppercase letter, a lowercase letter, a
            number, and a special character.
          </li>
          <li>
            <strong className="text-foreground">Email verification</strong> is
            required before you can log in. We email you a 6-digit code that
            expires after 5 minutes; enter it on the verify page and
            you&apos;re in.
          </li>
        </ul>
        <p>
          Forgot your password? Use the reset link on the login page — we
          email you a code to set a new one. You can log in with either your
          email or your username.
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
        <p>Every account has shareable links that anyone can open:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-foreground">Organization page</strong> —{" "}
            <code className="rounded bg-secondary px-1 font-mono text-xs">
              /o/your-org
            </code>
            . Your public landing page: it lists your active questions and has
            a general feedback form. Copy it from the dashboard with one
            click.
          </li>
          <li>
            <strong className="text-foreground">Question links</strong> —{" "}
            <code className="rounded bg-secondary px-1 font-mono text-xs">
              /o/your-org/q/abc12345
            </code>
            . Each question gets its own link so you can ask for feedback on
            one specific thing.
          </li>
          <li>
            <strong className="text-foreground">Personal link</strong> —{" "}
            <code className="rounded bg-secondary px-1 font-mono text-xs">
              /u/your-username
            </code>
            . The original SignalHQ link; it still works and forwards visitors
            to your organization page.
          </li>
        </ul>
        <Screenshot
          src="/guide/share-link.png"
          alt="The dashboard's general view with the organization feedback link and Copy link / Preview buttons"
          width={940}
          height={400}
          caption="Your organization link lives at the top of the dashboard — copy it or preview what visitors see."
        />
        <p>
          Not ready for feedback? Flip the{" "}
          <em>&ldquo;accepting messages&rdquo;</em> switch on your dashboard
          and senders are politely turned away until you flip it back.
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
          A question is a focused feedback prompt — &ldquo;What should we
          change about our sprint process?&rdquo; — with its own link and its
          own pile of responses. Create them from the dashboard with a prompt
          (up to 500 characters) and an optional longer description. You can
          deactivate a question at any time to stop new responses without
          deleting what you&apos;ve received.
        </p>
        <p>Questions come in two visibilities:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-foreground">Public</strong> (default) —
            anyone with the link answers anonymously, no account needed.
          </li>
          <li>
            <strong className="text-foreground">Internal</strong> — no public
            link at all. Only logged-in members of your organization can
            answer, and each member&apos;s answer becomes a private
            back-and-forth thread that only they and the org&apos;s
            owner/admins can see — never other members. Use this for
            check-ins, retros, or sensitive topics inside a team.
          </li>
        </ul>
        <Screenshot
          src="/guide/create-question.png"
          alt="The Create New Question dialog with 'Who can answer' set to Internal and the team set to Design"
          width={500}
          height={508}
          maxWidth="max-w-md"
          caption="Creating an internal question scoped to the Design team — only Design members can answer, each in their own private thread."
        />
      </>
    ),
  },
  {
    id: "inbox",
    chip: "bg-brand-mint",
    icon: <Inbox className="h-4.5 w-4.5" />,
    heading: "Reading your feedback",
    body: (
      <>
        <p>
          The dashboard is your inbox. The sidebar lists your questions;
          click one to see only its responses, click it again to go back to
          the general view (your org link and general messages). Messages
          show when they arrived, and you can delete any message you
          don&apos;t want to keep.
        </p>
        <p>
          If you belong to several organizations, the organization switcher in
          the dashboard flips your whole view between them — each org has its
          own questions, messages, and members.
        </p>
      </>
    ),
  },
  {
    id: "replying",
    chip: "bg-brand-pink",
    icon: <Reply className="h-4.5 w-4.5" />,
    heading: "Replying to anonymous senders",
    body: (
      <>
        <p>
          You can reply to an anonymous message without ever knowing who sent
          it. When someone submits feedback, they get a private receipt link
          to save; your reply appears there when they check back. Neither side
          learns anything about the other.
        </p>
        <p>
          Replying speaks for your organization, so it&apos;s limited to
          owners and admins (see{" "}
          <a href="#roles" className="font-semibold underline">
            roles
          </a>
          ).
        </p>
      </>
    ),
  },
  {
    id: "sending-feedback",
    chip: "bg-brand-blue",
    icon: <Send className="h-4.5 w-4.5" />,
    heading: "Sending feedback (no account needed)",
    body: (
      <>
        <p>
          Someone shared a SignalHQ link with you? Open it, type your message,
          hit send. That&apos;s the whole process — no account, no name, no
          email.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-foreground">You stay anonymous.</strong>{" "}
            Recipients never see who sent a message. (We briefly keep limited
            technical data like IP addresses purely for rate limiting — it is
            never shown to recipients.)
          </li>
          <li>
            <strong className="text-foreground">Save your receipt.</strong>{" "}
            After sending, you get a private link — bookmark it. If the
            recipient replies, the reply appears there. Lose the link and
            there&apos;s no way to recover the conversation (that&apos;s the
            price of anonymity).
            <Screenshot
              src="/guide/reply-receipt.png"
              alt="The receipt card shown after sending anonymous feedback, with a private link and a Copy button"
              width={620}
              height={132}
              maxWidth="mt-3 max-w-xl"
              caption="Your receipt appears right after you send — this link is the only way back to the conversation."
            />
          </li>
          <li>
            <strong className="text-foreground">Be decent.</strong> Clearly
            abusive, hateful, or threatening messages are blocked before they
            send, and submissions are rate-limited to deter spam.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "organizations",
    chip: "bg-brand-yellow",
    icon: <Building2 className="h-4.5 w-4.5" />,
    heading: "Organizations",
    body: (
      <>
        <p>
          Everything in SignalHQ lives inside an organization. When you sign
          up, we create a personal one for you automatically — you&apos;re its
          owner, and your feedback links point at it. You can rename it, or
          create additional organizations (a company, a side project, a
          community) from the organization switcher and hop between them.
        </p>
        <p>
          Each organization has its own slug (the{" "}
          <code className="rounded bg-secondary px-1 font-mono text-xs">
            /o/…
          </code>{" "}
          link), members, teams, questions, and messages — nothing leaks
          between organizations.
        </p>
      </>
    ),
  },
  {
    id: "roles",
    chip: "bg-brand-mint",
    icon: <Shield className="h-4.5 w-4.5" />,
    heading: "Roles: Owner, Admin, Member",
    body: (
      <>
        <p>
          Your role is per-organization — you can be an owner of your personal
          org and a plain member somewhere else.
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
                ["Create & view questions, read feedback", "✓", "✓", "✓"],
                ["Answer internal questions", "✓", "✓", "✓"],
                ["Reply to anonymous senders", "✓", "✓", "—"],
                ["See every member's internal-question thread", "✓", "✓", "—"],
                ["Manage teams, invite & remove members", "✓", "✓", "—"],
                ["Rename or delete the org, change its plan", "✓", "—", "—"],
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
          Admins can&apos;t act on people at or above their own rank — only an
          owner can promote, demote, or remove an admin.
        </p>
      </>
    ),
  },
  {
    id: "teams",
    chip: "bg-brand-pink",
    icon: <Users className="h-4.5 w-4.5" />,
    heading: "Teams",
    body: (
      <>
        <p>
          Teams split a bigger organization into groups — Engineering, Design,
          Marketing — and a person can belong to several. Questions can be
          scoped to a team or left org-level.
        </p>
        <p>
          Scoping controls visibility: owners and admins see everything, but a
          member only sees org-level questions plus the ones scoped to teams
          they&apos;re actually in. A question for the Design team stays
          inside the Design team.
        </p>
        <Screenshot
          src="/guide/dashboard-sidebar.png"
          alt="The dashboard sidebar showing a team filter and two questions — one organization-wide, one internal and scoped to the Design team"
          width={340}
          height={740}
          maxWidth="max-w-[340px]"
          caption="Each question in the sidebar shows its scope (Organization-wide vs. a team) and an Internal badge when it isn't publicly answerable."
        />
      </>
    ),
  },
  {
    id: "invitations",
    chip: "bg-brand-blue",
    icon: <Mail className="h-4.5 w-4.5" />,
    heading: "Inviting people",
    body: (
      <>
        <p>
          Owners and admins invite people by email from the organization page,
          choosing their role (admin or member — ownership isn&apos;t granted
          by invite) and optionally dropping them straight into a team. The
          invitee gets an email with a single-use link; opening it shows the
          invitation, and they can accept with an existing account or sign up
          first — the invite survives the detour.
        </p>
        <p>
          Each person can have one live invitation per organization at a time,
          and pending invites can be revoked from the members page.
        </p>
      </>
    ),
  },
  {
    id: "plans",
    chip: "bg-brand-yellow",
    icon: <CreditCard className="h-4.5 w-4.5" />,
    heading: "Plans",
    body: (
      <>
        <p>
          Plans are per-organization and mainly change how many teams it can
          have: <strong className="text-foreground">Free</strong> allows 2
          teams, <strong className="text-foreground">Pro</strong> allows 10,
          and <strong className="text-foreground">Enterprise</strong> is
          unlimited. Feedback itself is never capped on any plan.
        </p>
        <p>
          SignalHQ is in early access, so every plan is currently free —
          owners can switch tiers on the organization page, and you can
          compare them any time on the{" "}
          <Link href="/pricing" className="font-semibold underline">
            pricing page
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    id: "account",
    chip: "bg-brand-mint",
    icon: <Settings className="h-4.5 w-4.5" />,
    heading: "Account settings",
    body: (
      <>
        <p>
          Account settings (under your dashboard) shows your profile, your
          current plan with a shortcut to the pricing page, and account
          deletion. Deleting your account removes organizations only you own
          — if an org you own still has other members, transfer ownership or
          remove them first, so a team never loses its workspace by surprise.
        </p>
      </>
    ),
  },
  {
    id: "tips",
    chip: "bg-brand-pink",
    icon: <Lightbulb className="h-4.5 w-4.5" />,
    heading: "Tips & shortcuts",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong className="text-foreground">Enter sends</strong> in every
          composer; <strong className="text-foreground">Shift+Enter</strong>{" "}
          adds a new line. (On phones, Enter just makes a new line as usual.)
        </li>
        <li>
          <strong className="text-foreground">Click a selected question
          again</strong> in the dashboard sidebar to jump back to the general
          view.
        </li>
        <li>
          <strong className="text-foreground">Dark mode</strong> lives behind
          the moon button in the navbar.
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
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-ink text-ink shadow-solid-sm ${section.chip}`}
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

        <div className="mt-16 rounded-2xl border-2 border-ink bg-brand-yellow p-6 text-ink shadow-solid">
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
