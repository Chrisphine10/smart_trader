import type { Metadata } from "next";
import { LegalPage } from "../../components/legal-page";

export const metadata: Metadata = {
  title: "Terms and Conditions - Hydra Trade",
  description: "Hydra Trade terms for AI-assisted trading, accounts, wallets, P2P, payments, automation, and platform services.",
};

export default function TermsAndConditionsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms and Conditions"
      updated="May 14, 2026"
      intro="These Terms and Conditions govern access to Hydra Trade, including AI-assisted trading tools, wallet modules, P2P escrow, support, payment settings, automation, and simulated market features."
      sections={[
        {
          title: "Platform Use",
          body: [
            "You must provide accurate account information, keep your credentials secure, and use the platform only for lawful purposes. You are responsible for activity performed through your account.",
            "Hydra Trade may restrict, suspend, or review accounts for security, fraud prevention, compliance, chargeback risk, abuse, disputes, or operational reasons.",
          ],
        },
        {
          title: "Trading Risk",
          body: [
            "Trading digital assets, derivatives-style products, synthetic indices, forex views, and automated strategies involves substantial risk. Prices can move quickly, liquidity may vary, and losses can exceed expectations in leveraged or simulated market views.",
            "The current platform is designed for sandbox and local ledger settlement unless a production deployment is separately configured, licensed, secured, and approved. Nothing on the platform is financial advice.",
          ],
        },
        {
          title: "Wallets, Deposits, And Withdrawals",
          body: [
            "Deposits, withdrawals, payment methods, exchange rates, fees, network availability, and review requirements may be configured by the platform. Withdrawals may require KYC, risk review, balance checks, or manual approval.",
            "Self-hosted wallet integrations should remain testnet-first until production custody, compliance, operational, and security controls are completed.",
          ],
        },
        {
          title: "P2P Escrow",
          body: [
            "P2P trades may lock seller crypto in escrow while buyers and sellers complete fiat payment steps. Users must follow order terms, provide accurate payment proof, and avoid off-platform fraud.",
            "Hydra Trade may freeze, cancel, release, refund, or dispute orders based on available evidence, risk controls, and platform rules.",
          ],
        },
        {
          title: "Bots And Automation",
          body: [
            "AI-assisted bot templates, strategy builders, and automated trading controls are provided as decision-support tools. Users remain responsible for selected markets, budgets, leverage, stops, risk settings, and outcomes.",
            "Hydra Trade may pause automation when limits, system health, market state, or risk controls require intervention.",
          ],
        },
        {
          title: "Changes To Terms",
          body: [
            "Hydra Trade may update these terms as features, providers, laws, compliance requirements, or operational controls change. Continued use of the platform after an update means you accept the updated terms.",
          ],
        },
      ]}
    />
  );
}
