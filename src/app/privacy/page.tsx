import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | CampRally",
  description: "Privacy policy for CampRally.co",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="mb-4 text-3xl font-bold tracking-tight">
        Privacy Policy
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Last updated: March 1, 2026
      </p>

      <div className="space-y-6 text-sm leading-7 text-foreground/85">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            1. Information We Collect
          </h2>
          <p>
            CampRally may collect non-personal information such as browser type,
            operating system, and pages visited through standard analytics tools.
            If you subscribe to our newsletter, we collect your email address
            solely for the purpose of sending you camping tips and gear
            recommendations.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            2. How We Use Information
          </h2>
          <p>We use collected information to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>Improve our website content and user experience</li>
            <li>Send newsletters to subscribers who opt in</li>
            <li>Analyze site traffic and usage patterns</li>
            <li>Ensure the security of our website</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            3. Cookies
          </h2>
          <p>
            We use cookies to enhance your browsing experience and for analytics
            purposes. Third-party services, including Amazon Associates and
            analytics providers, may also set cookies. You can disable cookies in
            your browser settings, though this may affect site functionality.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            4. Affiliate Links and Third Parties
          </h2>
          <p>
            Our site contains affiliate links to Amazon.com and potentially
            other retailers. When you click these links, those third parties may
            collect data subject to their own privacy policies. We encourage you
            to review the privacy policies of any third-party sites you visit.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            5. Data Security
          </h2>
          <p>
            We take reasonable measures to protect any personal information you
            provide. However, no method of transmission over the internet is
            100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            6. Your Rights
          </h2>
          <p>
            You may request to view, update, or delete any personal data we hold
            about you. To unsubscribe from our newsletter, use the unsubscribe
            link in any email or contact us directly.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            7. Changes to This Policy
          </h2>
          <p>
            We may update this Privacy Policy from time to time. Changes will be
            posted on this page with an updated revision date.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            8. Contact
          </h2>
          <p>
            For privacy-related inquiries, please contact us at
            hello@camprally.co.
          </p>
        </section>
      </div>
    </div>
  );
}
