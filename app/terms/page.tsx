import { generateMetadata as buildMetadata } from "@/lib/metadata";

export const generateMetadata = () =>
  buildMetadata({
    title: "Terms of Service",
    description:
      "The terms that govern your use of SignalHQ (Feedbacker.io) — accounts, anonymous feedback, organizations, and acceptable use.",
    url: "/terms",
  });

const LAST_UPDATED = "July 2, 2026";

const SECTIONS: { heading: string; body: React.ReactNode }[] = [
  {
    heading: "1. Acceptance of these Terms",
    body: (
      <p>
        By creating an account, sharing a feedback link, or submitting a
        message through SignalHQ (&ldquo;Feedbacker.io,&rdquo; &ldquo;we,&rdquo;
        &ldquo;us&rdquo;), you agree to these Terms of Service. If you don&apos;t
        agree, don&apos;t use the service. We may update these Terms from time
        to time; continued use after an update means you accept the revised
        Terms.
      </p>
    ),
  },
  {
    heading: "2. What SignalHQ does",
    body: (
      <p>
        SignalHQ lets registered users create a shareable link and receive
        anonymous messages from anyone with that link — optionally organized
        around specific feedback &ldquo;questions,&rdquo; and optionally
        scoped to an Organization and its Teams. We provide the
        infrastructure to collect, view, and reply to that feedback. We are
        not a party to, and do not moderate in real time, the content of any
        message before it&apos;s sent.
      </p>
    ),
  },
  {
    heading: "3. Accounts",
    body: (
      <>
        <p>
          You must provide accurate information when signing up and verify
          your email address to activate your account. You&apos;re
          responsible for keeping your login credentials confidential and for
          all activity under your account.
        </p>
        <p className="mt-3">
          You must be at least 13 years old to use SignalHQ. If you&apos;re
          under the age of majority in your jurisdiction, you confirm you
          have a parent or guardian&apos;s permission.
        </p>
      </>
    ),
  },
  {
    heading: "4. Anonymous feedback — how it actually works",
    body: (
      <>
        <p>
          Anyone with your link can submit a message without creating an
          account or providing their name. We do not verify the identity of
          anonymous senders, and by design we do not disclose sender identity
          to recipients. We may retain limited technical data (such as an IP
          address) for a short period solely to apply rate limits and deter
          abuse of the public submission endpoints — this is not shown to
          recipients and is not intended to re-identify senders for normal
          use of the product.
        </p>
        <p className="mt-3">
          Because we don&apos;t authenticate senders, you understand that
          anonymous messages carry the same reliability as any anonymous
          input: we cannot guarantee accuracy, and we are not responsible for
          the content, tone, or intent of messages submitted by third
          parties.
        </p>
      </>
    ),
  },
  {
    heading: "5. Acceptable use",
    body: (
      <>
        <p>You agree not to use SignalHQ to:</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>
            Submit or solicit messages that are unlawful, threatening,
            harassing, defamatory, or that disclose another person&apos;s
            private information without their consent.
          </li>
          <li>
            Attempt to identify, dox, or retaliate against an anonymous
            sender.
          </li>
          <li>
            Circumvent rate limits, scrape the service, or interfere with its
            normal operation.
          </li>
          <li>
            Impersonate another person or organization, or misrepresent your
            affiliation with one.
          </li>
          <li>
            Use the service to violate any applicable law or the rights of
            any third party.
          </li>
        </ul>
        <p className="mt-3">
          We may remove content or suspend accounts that violate this
          section. Today, moderation is primarily manual (recipients can
          delete messages sent to them); we&apos;re actively building
          additional reporting and filtering tools.
        </p>
      </>
    ),
  },
  {
    heading: "6. Organizations, Teams, and roles",
    body: (
      <p>
        If you create or join an Organization, your role (Owner, Admin, or
        Member) determines what you can see and do within that
        Organization&apos;s Teams, Questions, and Messages, as described in
        the product. Organization Owners and Admins are responsible for
        managing membership and access within their Organization, including
        removing members who should no longer have access.
      </p>
    ),
  },
  {
    heading: "7. Subscription and billing",
    body: (
      <p>
        SignalHQ is currently in early access and free to use across all
        plans described on our{" "}
        <a href="/pricing" className="font-semibold underline">
          pricing page
        </a>
        . We plan to introduce paid plans in the future; if we do, we&apos;ll
        give advance notice and you&apos;ll be able to choose whether to
        upgrade before any charge applies.
      </p>
    ),
  },
  {
    heading: "8. Termination",
    body: (
      <p>
        You may stop using SignalHQ and request deletion of your account at
        any time by contacting us (self-service deletion is on our roadmap).
        We may suspend or terminate accounts that violate these Terms, with
        or without notice, particularly where necessary to protect the
        service or other users.
      </p>
    ),
  },
  {
    heading: "9. Disclaimers and limitation of liability",
    body: (
      <p>
        SignalHQ is provided &ldquo;as is&rdquo; without warranties of any
        kind, express or implied. We do not warrant that the service will be
        uninterrupted, error-free, or secure. To the maximum extent permitted
        by law, we are not liable for any indirect, incidental, or
        consequential damages arising from your use of the service or from
        content submitted by third parties, including anonymous senders.
      </p>
    ),
  },
  {
    heading: "10. Changes to these Terms",
    body: (
      <p>
        We may revise these Terms as the product evolves. We&apos;ll update
        the &ldquo;last updated&rdquo; date below when we do, and for
        material changes we&apos;ll make reasonable efforts to notify
        registered users.
      </p>
    ),
  },
  {
    heading: "11. Contact",
    body: (
      <p>
        Questions about these Terms? Reach us at{" "}
        <a href="mailto:nishchay.agar@gmail.com" className="font-semibold underline">
          nishchay.agar@gmail.com
        </a>
        .
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <div className="bg-background text-foreground">
      <div className="border-b-2 border-ink bg-dot-grid">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Terms of <span className="highlight">Service</span>
          </h1>
          <p className="mt-4 text-sm font-semibold text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </div>

      <article className="mx-auto max-w-3xl px-6 py-16">
        {SECTIONS.map((section) => (
          <section key={section.heading} className="mt-10 first:mt-0">
            <h2 className="text-2xl font-black tracking-tight">
              {section.heading}
            </h2>
            <div className="mt-3 space-y-3 leading-relaxed text-muted-foreground">
              {section.body}
            </div>
          </section>
        ))}
      </article>
    </div>
  );
}
