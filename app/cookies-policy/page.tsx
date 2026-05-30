import type { Metadata } from "next";
import { LegalPage } from "../../components/legal-page";

export const metadata: Metadata = {
  title: "Cookies Policy - Hydra Trade",
  description: "Hydra Trade cookies policy for authentication, preferences, analytics, and security.",
};

export default function CookiesPolicyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Cookies Policy"
      updated="May 14, 2026"
      intro="This Cookies Policy explains how Hydra Trade may use cookies, browser storage, and similar technologies to keep the platform secure, personalized, and functional."
      sections={[
        {
          title: "What We Use",
          body: [
            "Hydra Trade may use cookies, local storage, session storage, and similar browser technologies to remember authentication tokens, account mode, dashboard preferences, chart settings, theme options, and support state.",
            "Some data is essential for the platform to work, while other data helps keep user preferences consistent across visits.",
          ],
        },
        {
          title: "Essential Cookies And Storage",
          body: [
            "Essential storage supports login sessions, account protection, CSRF and abuse prevention, wallet and trading dashboard continuity, and secure navigation between authenticated areas.",
            "Disabling essential browser storage may prevent login, trading, wallet, P2P, support, or admin features from working correctly.",
          ],
        },
        {
          title: "Preference And Analytics Storage",
          body: [
            "Preference storage may remember chart intervals, selected markets, sidebar state, notification settings, color theme, sound settings, and other usability choices.",
            "If analytics are configured, they should be used to understand aggregate platform performance and product reliability rather than to sell personal information.",
          ],
        },
        {
          title: "Managing Cookies",
          body: [
            "You can clear or block cookies and browser storage through your browser settings. Clearing storage may sign you out and reset local dashboard preferences.",
            "For shared devices, sign out after use and avoid saving credentials in the browser.",
          ],
        },
      ]}
    />
  );
}
