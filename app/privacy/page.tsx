import { generateMetadata as buildMetadata } from "@/lib/metadata";

export const generateMetadata = () =>
  buildMetadata({
    title: "Privacy Policy",
    description:
      "How SignalHQ (Feedbacker.io) collects, uses, and protects data from registered users and anonymous message senders.",
    url: "/privacy",
  });

const LAST_UPDATED = "July 2, 2026";

const SECTIONS: { heading: string; body: React.ReactNode }[] = [
  {
    heading: "1. Overview",
    body: (
      <p>
        This policy explains what data SignalHQ (&ldquo;Feedbacker.io,&rdquo;
        &ldquo;we,&rdquo; &ldquo;us&rdquo;) collects, from whom, and why.
        Because the product has two distinct populations — registered users
        and anonymous message senders — we treat their data differently, as
        described below.
      </p>
    ),
  },
  {
    heading: "2. Information from registered users",
    body: (
      <>
        <p>When you create an account, we collect:</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Name, username, and email address.</li>
          <li>
            A securely hashed password (we never store your password in
            plain text).
          </li>
          <li>
            Organization and Team data you create or are added to, and your
            role within them.
          </li>
          <li>
            The Questions you create and the Messages sent to you, including
            any replies you write.
          </li>
          <li>
            Basic product analytics (see Section 5) if you haven&apos;t
            opted out and our analytics providers are configured.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "3. Information from anonymous senders",
    body: (
      <>
        <p>
          Submitting feedback through a SignalHQ link does not require an
          account, a name, or an email address, and we do not ask for or
          store any of these unless you choose to include them in your
          message text. The content of the message itself is stored so the
          recipient can read and, if enabled, reply to it.
        </p>
        <p className="mt-3">
          We temporarily log limited technical data (such as IP address) for
          messages submitted through public endpoints, solely to enforce
          rate limits and reduce spam/abuse. This data is not linked to a
          sender identity, is not shown to the message recipient, and is not
          used to re-identify who sent a given message.
        </p>
      </>
    ),
  },
  {
    heading: "4. How we use data",
    body: (
      <>
        <p>We use the data described above to:</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Operate core features — accounts, links, questions, and messages.</li>
          <li>
            Send transactional email: verification codes, password resets,
            and organization invitations.
          </li>
          <li>Enforce rate limits and detect abuse on public submission endpoints.</li>
          <li>Understand aggregate product usage to improve SignalHQ.</li>
          <li>Comply with legal obligations where applicable.</li>
        </ul>
        <p className="mt-3">We do not sell personal data.</p>
      </>
    ),
  },
  {
    heading: "5. Third parties we use",
    body: (
      <>
        <p>SignalHQ relies on a small number of service providers to operate:</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>
            <span className="font-semibold text-foreground">MongoDB</span> —
            hosts our database (accounts, organizations, questions, and
            messages).
          </li>
          <li>
            <span className="font-semibold text-foreground">Resend</span> —
            delivers transactional email (verification, password reset,
            invitations).
          </li>
          <li>
            <span className="font-semibold text-foreground">
              Google Analytics
            </span>{" "}
            and{" "}
            <span className="font-semibold text-foreground">
              Microsoft Clarity
            </span>{" "}
            — optional product-analytics tools, only active when we&apos;ve
            configured them for a given deployment. They may use cookies or
            similar technology to understand aggregate usage.
          </li>
        </ul>
        <p className="mt-3">
          These providers process data on our behalf and are not permitted to
          use it for their own purposes.
        </p>
      </>
    ),
  },
  {
    heading: "6. Cookies",
    body: (
      <p>
        We use a session cookie to keep you signed in. If analytics is
        configured (Section 5), those providers may set their own cookies to
        distinguish visitors. We don&apos;t use cookies for cross-site ad
        tracking.
      </p>
    ),
  },
  {
    heading: "7. Data retention",
    body: (
      <p>
        We retain account data for as long as your account is active.
        Messages and Questions persist until you delete them or delete your
        account. Rate-limiting technical logs (Section 3) are kept only for
        a short window needed to enforce limits, not indefinitely.
      </p>
    ),
  },
  {
    heading: "8. Your rights and choices",
    body: (
      <>
        <p>
          You can review and edit your account details, and delete
          individual Questions or Messages, directly from your dashboard.
          Self-service account deletion is on our near-term roadmap; until
          it ships, you can request deletion of your account and associated
          data by emailing us at the address below, and we&apos;ll process
          it promptly.
        </p>
        <p className="mt-3">
          Depending on your location, you may have additional rights under
          laws like the GDPR or CCPA — including access, correction, and
          portability of your data. Contact us to exercise these rights.
        </p>
      </>
    ),
  },
  {
    heading: "9. Data security",
    body: (
      <p>
        We use industry-standard measures to protect data in transit and at
        rest, including hashed passwords and access-controlled
        infrastructure. No system is perfectly secure, and we can&apos;t
        guarantee absolute security, but we take reasonable steps to protect
        your information and will notify affected users if we become aware
        of a breach affecting their data, as required by law.
      </p>
    ),
  },
  {
    heading: "10. Children's privacy",
    body: (
      <p>
        SignalHQ is not directed at children under 13, and we do not
        knowingly collect personal information from them. If you believe a
        child has provided us personal data, contact us and we&apos;ll
        delete it.
      </p>
    ),
  },
  {
    heading: "11. Changes to this policy",
    body: (
      <p>
        We may update this policy as the product evolves. We&apos;ll update
        the &ldquo;last updated&rdquo; date below, and for material changes
        we&apos;ll make reasonable efforts to notify registered users.
      </p>
    ),
  },
  {
    heading: "12. Contact",
    body: (
      <p>
        Questions about this policy, or want to exercise a data right?
        Reach us at{" "}
        <a
          href="mailto:nishchay.agar@gmail.com"
          className="font-semibold underline"
        >
          nishchay.agar@gmail.com
        </a>
        .
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="bg-background text-foreground">
      <div className="border-b-2 border-ink bg-dot-grid">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Privacy <span className="highlight">Policy</span>
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
