import type { Metadata } from "next";
import { LegalPage } from "../../components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy - Hydra Trade",
  description: "Hydra Trade privacy policy for AI-assisted trading, account, wallet, support, and security data.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      updated="May 14, 2026"
      intro="This Privacy Policy explains how Hydra Trade handles information in this AI-powered trading platform, including account, wallet, simulated trading, P2P, support, and operational workflows."
      sections={[
        {
          title: "Information We Collect",
          body: [
            "We collect account details such as name, email address, phone number, profile settings, authentication state, KYC submission metadata, and support messages you choose to send.",
            "We record platform activity including orders, positions, wallet ledger entries, deposits, withdrawals, transfers, P2P ads, escrow orders, payment proof metadata, chat messages, risk decisions, device/session metadata, and audit events.",
          ],
        },
        {
          title: "How We Use Information",
          body: [
            "We use information to operate accounts, display balances, process sandbox deposits and withdrawals, simulate trading settlement, support AI-assisted workflows, support P2P escrow flows, respond to support requests, review KYC, prevent abuse, and improve platform reliability.",
            "Authorized operations users may review operational records, support conversations, payment requests, KYC submissions, disputes, and audit logs to keep the system functioning and secure.",
          ],
        },
        {
          title: "Payments, Wallets, And Trading Data",
          body: [
            "Hydra Trade is configured as a sandbox and testnet-first platform unless production providers are explicitly configured by authorized operators. Ledger balances remain the platform source of truth.",
            "Payment provider references, wallet addresses, transaction records, proof metadata, and withdrawal review notes may be stored so that deposits, transfers, refunds, disputes, and reconciliation can be tracked.",
          ],
        },
        {
          title: "Sharing And Retention",
          body: [
            "We do not sell personal information. We may share limited information with configured payment, wallet, security, hosting, analytics, or support providers when needed to operate the service.",
            "Records are retained as long as needed for account operation, security, dispute handling, legal compliance, auditability, and legitimate business purposes. You may request account assistance through support.",
          ],
        },
        {
          title: "Security",
          body: [
            "We use access controls, hashed passwords, token-based sessions, audit logs, and review flows. No internet-connected financial platform can be guaranteed risk-free, so users should protect credentials and report suspicious activity.",
          ],
        },
      ]}
    />
  );
}
