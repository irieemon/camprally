import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use | CampRally",
  description: "Terms and conditions for using CampRally.co",
};

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="mb-4 text-3xl font-bold tracking-tight">Terms of Use</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Last updated: March 1, 2026
      </p>

      <div className="space-y-6 text-sm leading-7 text-foreground/85">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            1. Acceptance of Terms
          </h2>
          <p>
            By accessing and using CampRally.co (&quot;the Site&quot;), you
            accept and agree to be bound by these Terms of Use. If you do not
            agree to these terms, please do not use the Site.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            2. Content and Information
          </h2>
          <p>
            The content on CampRally is provided for general informational
            purposes only. While we strive for accuracy, we make no guarantees
            about the completeness, reliability, or suitability of the
            information. Product prices, availability, and specifications may
            change without notice.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            3. Affiliate Links
          </h2>
          <p>
            CampRally contains affiliate links to third-party websites,
            including Amazon.com. When you click these links and make a purchase,
            we may earn a commission at no additional cost to you. We are not
            responsible for the content, products, or services offered by
            third-party websites.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            4. Intellectual Property
          </h2>
          <p>
            All content on this Site, including text, images, graphics, and
            logos, is the property of CampRally and is protected by copyright
            laws. You may not reproduce, distribute, or create derivative works
            without our written permission.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            5. Disclaimer of Warranties
          </h2>
          <p>
            The Site is provided &quot;as is&quot; without warranties of any
            kind. Camping and outdoor activities involve inherent risks. Always
            exercise proper judgment and follow safety guidelines when engaging
            in outdoor activities. CampRally is not liable for any injuries,
            damages, or losses resulting from the use of information on this
            Site.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            6. Changes to Terms
          </h2>
          <p>
            We reserve the right to modify these terms at any time. Continued
            use of the Site after changes constitutes acceptance of the updated
            terms.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            7. Contact
          </h2>
          <p>
            If you have questions about these Terms, please contact us at
            hello@camprally.co.
          </p>
        </section>
      </div>
    </div>
  );
}
