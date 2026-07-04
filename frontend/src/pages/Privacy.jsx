// Privacy Policy — BillingsEasy (AI-powered GST Billing SaaS)
// Legally compliant with DPDP Act 2023, IT Act 2000, SPDI Rules 2011,
// Consumer Protection Act 2019, Indian Contract Act 1872
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, ChevronRight, Mail, ArrowLeft, ExternalLink } from "lucide-react";

const TOC = [
  { id: "introduction", label: "1. Introduction & Scope" },
  { id: "data-fiduciary", label: "2. Data Fiduciary Information" },
  { id: "data-collected", label: "3. Personal Data We Collect" },
  { id: "how-we-collect", label: "4. How We Collect Data" },
  { id: "purpose", label: "5. Purpose of Processing" },
  { id: "sensitive-data", label: "6. Sensitive Personal Data" },
  { id: "how-we-use", label: "7. How We Use Your Data" },
  { id: "data-sharing", label: "8. Data Sharing & Third Parties" },
  { id: "cross-border", label: "9. Cross-Border Data Transfers" },
  { id: "retention", label: "10. Data Retention" },
  { id: "your-rights", label: "11. Your Rights (DPDP Act 2023)" },
  { id: "cookies", label: "12. Cookies & Tracking" },
  { id: "childrens-privacy", label: "13. Children's Privacy" },
  { id: "security", label: "14. Security Measures" },
  { id: "grievance", label: "15. Grievance Redressal" },
  { id: "changes", label: "16. Changes to This Policy" },
  { id: "contact", label: "17. Contact Us" },
];

function SectionHeading({ id, number, title }) {
  return (
    <h2
      id={id}
      className="text-xl font-bold text-gray-900 dark:text-white mt-10 mb-4 flex items-center gap-2 scroll-mt-24"
    >
      <span className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-sm font-bold">
        {number}
      </span>
      {title}
    </h2>
  );
}

function SubHeading({ children }) {
  return (
    <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mt-6 mb-2">
      {children}
    </h3>
  );
}

function P({ children }) {
  return (
    <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4 text-sm">
      {children}
    </p>
  );
}

function LegalNote({ children }) {
  return (
    <div className="border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-500 rounded-r-lg px-4 py-3 mb-4 text-sm text-blue-900 dark:text-blue-200">
      {children}
    </div>
  );
}

function Table({ headers, rows }) {
  return (
    <div className="overflow-x-auto mb-6 rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={
                i % 2 === 0
                  ? "bg-white dark:bg-gray-900"
                  : "bg-gray-50 dark:bg-gray-800/50"
              }
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-4 py-3 text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-700 align-top"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Ul({ items }) {
  return (
    <ul className="list-disc list-inside space-y-1 mb-4 text-sm text-gray-700 dark:text-gray-300 pl-2">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function Privacy() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("introduction");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const offsets = TOC.map(({ id }) => {
        const el = document.getElementById(id);
        if (!el) return { id, top: Infinity };
        return { id, top: el.getBoundingClientRect().top };
      });
      const visible = offsets.filter((o) => o.top <= 120);
      if (visible.length > 0) {
        setActiveSection(visible[visible.length - 1].id);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white">
      {/* Top nav bar */}
      <div className="sticky top-0 z-40 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </button>
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <Shield className="w-4 h-4 text-blue-600" />
            BillingsEasy Privacy Policy
          </div>
          <a
            href="mailto:vijayakumartech1@gmail.com"
            className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
          >
            <Mail className="w-4 h-4" />
            <span className="hidden sm:inline">Contact</span>
          </a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex gap-10">
        {/* Sticky Table of Contents — desktop only */}
        <aside className="hidden lg:block w-72 flex-shrink-0">
          <div className="sticky top-20">
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Table of Contents
              </p>
              <nav className="space-y-1">
                {TOC.map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => scrollTo(id)}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                      activeSection === id
                        ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  >
                    <ChevronRight
                      className={`w-3 h-3 flex-shrink-0 transition-transform ${
                        activeSection === id ? "rotate-90" : ""
                      }`}
                    />
                    {label}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 max-w-3xl">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="inline-flex items-center gap-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-semibold px-3 py-1 rounded-full border border-green-200 dark:border-green-700">
                <Shield className="w-3 h-3" />
                DPDP Act 2023 Compliant
              </span>
              <span className="inline-flex items-center bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700">
                Last Updated: July 4, 2026
              </span>
              <span className="inline-flex items-center bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs px-3 py-1 rounded-full border border-blue-200 dark:border-blue-700">
                Effective: July 2026
              </span>
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-3">
              Privacy Policy
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              This Privacy Policy governs the collection, processing, storage, sharing, and protection
              of personal data by BillingsEasy in connection with our AI-powered GST billing software
              and related services. We are committed to transparency and to your rights under
              applicable Indian law.
            </p>
          </div>

          {/* ── 1. Introduction & Scope ── */}
          <SectionHeading id="introduction" number="1" title="Introduction & Scope" />
          <P>
            BillingsEasy ("<strong>we</strong>", "<strong>us</strong>", "<strong>our</strong>", or
            "<strong>the Company</strong>") is an AI-powered GST billing and business management
            Software-as-a-Service (SaaS) platform designed for Indian businesses. We provide
            invoicing, GST return filing assistance, inventory management, payment tracking,
            AI-powered financial insights, and related business tools through our website at{" "}
            <a
              href="https://billingeasy.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              https://billingeasy.com
            </a>{" "}
            and associated mobile or desktop interfaces (collectively, the "<strong>Platform</strong>
            ").
          </P>
          <P>
            This Privacy Policy ("<strong>Policy</strong>") describes how we collect, use, disclose,
            transfer, store, and protect your personal data when you access or use the Platform. It
            also explains your rights with respect to your personal data and how you may exercise
            those rights.
          </P>
          <P>
            This Policy applies to all individuals who interact with BillingsEasy, including:
          </P>
          <Ul
            items={[
              "Registered account holders (business owners, proprietors, accountants, employees granted access)",
              "Visitors to our public-facing website",
              "Recipients of invoices or documents generated through the Platform (where their data is processed by us)",
              "Prospective customers enquiring about our services",
            ]}
          />
          <LegalNote>
            <strong>Legal Basis:</strong> This Policy is published in compliance with the{" "}
            <strong>Digital Personal Data Protection (DPDP) Act, 2023</strong>; the{" "}
            <strong>Information Technology Act, 2000</strong> and its Amendment Act, 2008; the{" "}
            <strong>
              IT (Reasonable Security Practices and Procedures and Sensitive Personal Data or
              Information) Rules, 2011
            </strong>{" "}
            ("<strong>SPDI Rules</strong>"); the <strong>Consumer Protection Act, 2019</strong>; and
            the <strong>Indian Contract Act, 1872</strong>. By using our Platform, you enter into a
            legally binding agreement with us on the terms set out in our Terms of Service, of which
            this Policy forms an integral part.
          </LegalNote>
          <P>
            If you do not agree with this Policy, you must discontinue use of the Platform
            immediately. Your continued use of the Platform after any update to this Policy
            constitutes your acceptance of the revised terms to the extent permitted by law.
          </P>

          {/* ── 2. Data Fiduciary ── */}
          <SectionHeading id="data-fiduciary" number="2" title="Data Fiduciary Information" />
          <LegalNote>
            Under the <strong>Digital Personal Data Protection (DPDP) Act, 2023</strong>, any person
            who, alone or in conjunction with other persons, determines the purpose and means of
            processing of personal data is referred to as a "<strong>Data Fiduciary</strong>."
            BillingsEasy acts as the Data Fiduciary with respect to the personal data of its users
            and visitors.
          </LegalNote>
          <P>
            The Data Fiduciary responsible for your personal data is:
          </P>
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-6 text-sm space-y-2">
            <div className="flex gap-2">
              <span className="font-semibold text-gray-700 dark:text-gray-300 w-36">
                Business Name:
              </span>
              <span className="text-gray-900 dark:text-white font-medium">BillingsEasy</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-gray-700 dark:text-gray-300 w-36">
                Operated By:
              </span>
              <span className="text-gray-900 dark:text-white">Vijay Kumar</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-gray-700 dark:text-gray-300 w-36">Website:</span>
              <a
                href="https://billingeasy.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline flex items-center gap-1"
              >
                https://billingeasy.com <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-gray-700 dark:text-gray-300 w-36">
                Contact Email:
              </span>
              <a
                href="mailto:vijayakumartech1@gmail.com"
                className="text-blue-600 hover:underline"
              >
                vijayakumartech1@gmail.com
              </a>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-gray-700 dark:text-gray-300 w-36">
                Jurisdiction:
              </span>
              <span className="text-gray-900 dark:text-white">
                Republic of India
              </span>
            </div>
          </div>
          <P>
            As the Data Fiduciary, we are obligated under the DPDP Act, 2023 to process personal
            data only for a lawful purpose for which you have given your consent or where such
            processing is necessary for a legitimate use as specified in the Act. We are further
            obligated to implement appropriate technical and organisational measures to ensure the
            security of your personal data.
          </P>

          {/* ── 3. Data Collected ── */}
          <SectionHeading id="data-collected" number="3" title="What Personal Data We Collect" />
          <P>
            We collect the following categories of personal data, depending on how you use the
            Platform:
          </P>
          <SubHeading>3.1 Account Data</SubHeading>
          <Ul
            items={[
              "Full name of the account holder or authorised representative",
              "Business name, trade name, and legal entity type",
              "Email address (used as primary login identifier)",
              "Mobile phone number (for OTP verification and account recovery)",
              "Password (stored in cryptographically hashed form — never in plain text)",
              "Profile photograph (optional, uploaded at user's discretion)",
              "Subscription plan and billing history",
            ]}
          />
          <SubHeading>3.2 Business & Financial Data</SubHeading>
          <Ul
            items={[
              "GSTIN (Goods and Services Tax Identification Number)",
              "PAN (Permanent Account Number) of the business or proprietor",
              "Business address, registered office address, and shipping addresses",
              "Bank account details (account number, IFSC code, account holder name) — used for payment reconciliation and displaying on invoices",
              "Invoice data including buyer/seller names, amounts, tax breakdowns, HSN/SAC codes",
              "Inventory records including product names, SKUs, quantities, and pricing",
              "Vendor and customer details (business names, GST numbers, contact information)",
              "Expense records and purchase bills",
              "TDS (Tax Deducted at Source) deduction details",
            ]}
          />
          <SubHeading>3.3 Usage Data</SubHeading>
          <Ul
            items={[
              "Pages visited, features used, and actions performed within the Platform",
              "Session start and end times, frequency of use",
              "Search queries entered within the Platform",
              "Feature interaction logs (e.g., invoices created, GST returns generated)",
              "Error logs and crash reports for debugging and quality improvement",
              "AI/chatbot conversation history (queries to our AI assistant and responses generated)",
            ]}
          />
          <SubHeading>3.4 Device & Technical Data</SubHeading>
          <Ul
            items={[
              "IP address and approximate geographic location (city/region level) derived from IP",
              "Browser type and version, operating system",
              "Device type (desktop, mobile, tablet) and screen resolution",
              "HTTP referrer (which website or link directed you to our Platform)",
              "Cookies and similar tracking technologies (see Section 12)",
            ]}
          />
          <SubHeading>3.5 Communications Data</SubHeading>
          <Ul
            items={[
              "Emails, support tickets, or chat messages you send to us",
              "Feedback, survey responses, or testimonials you submit",
              "Content of any dispute or grievance filed with us",
            ]}
          />

          {/* ── 4. How We Collect ── */}
          <SectionHeading id="how-we-collect" number="4" title="How We Collect Data" />
          <SubHeading>4.1 Data You Provide Directly</SubHeading>
          <P>
            The majority of personal data we hold is provided directly by you when you:
          </P>
          <Ul
            items={[
              "Register for an account on the Platform",
              "Complete your business profile (GSTIN, PAN, address, bank details)",
              "Create invoices, record expenses, or add customers/vendors",
              "Subscribe to a paid plan and make payments",
              "Contact our support team or file a grievance",
              "Participate in surveys, promotions, or feedback programs",
              "Communicate with our AI assistant feature",
            ]}
          />
          <SubHeading>4.2 Data Collected Automatically</SubHeading>
          <P>
            When you access or use the Platform, we automatically collect certain technical and
            behavioural data through the following mechanisms:
          </P>
          <Ul
            items={[
              "Server logs: Our web servers automatically record access requests including IP address, timestamp, browser type, request path, and HTTP status codes.",
              "Cookies and local storage: We use session cookies, persistent cookies, and browser local storage to maintain your login session, remember preferences, and enable certain functionality.",
              "Analytics scripts: We use analytics tools to understand aggregate usage patterns, page performance, and feature adoption.",
              "Error tracking: Automated error logging tools capture exception reports and stack traces to help us diagnose and fix bugs.",
            ]}
          />
          <SubHeading>4.3 Data Received from Third Parties</SubHeading>
          <P>
            We may receive limited personal data from third-party service providers in the following
            circumstances:
          </P>
          <Ul
            items={[
              "Payment processors (e.g., Cashfree Payments) may share transaction status, reference numbers, and masked payment instrument details",
              "Government APIs (e.g., GST Network / NIC e-invoicing APIs) may return GSTIN verification data or e-invoice acknowledgement details when you initiate such lookups",
              "If you sign in via a third-party OAuth provider (if enabled in future), we receive the basic profile data that provider shares",
            ]}
          />

          {/* ── 5. Purpose of Processing ── */}
          <SectionHeading id="purpose" number="5" title="Purpose of Processing" />
          <P>
            We process personal data only for specific, clear, and lawful purposes. The table below
            sets out each processing purpose, the categories of data involved, and the legal basis
            under the DPDP Act, 2023 and SPDI Rules, 2011:
          </P>
          <Table
            headers={["Purpose", "Data Categories", "Legal Basis"]}
            rows={[
              [
                "Creating and managing your account",
                "Account data",
                "Consent (DPDP Act, S.6); Contract (Indian Contract Act, 1872)",
              ],
              [
                "Providing core billing and invoicing services",
                "Account, business & financial data",
                "Consent; Performance of contract",
              ],
              [
                "GST compliance — generating GSTR summaries, e-invoices, IRN",
                "Business & financial data, GSTIN",
                "Legal obligation (GST Act, 2017); Legitimate use",
              ],
              [
                "Payment processing and subscription management",
                "Account, financial data",
                "Consent; Performance of contract",
              ],
              [
                "AI-powered features (Ask AI, financial insights)",
                "Usage data, business data, query text",
                "Consent (explicit, at point of use)",
              ],
              [
                "Customer support and grievance redressal",
                "Account, communications data",
                "Legal obligation (IT Rules 2011, Consumer Protection Act 2019)",
              ],
              [
                "Security monitoring and fraud prevention",
                "Device, usage data",
                "Legitimate use (IT Act 2000, S.43A)",
              ],
              [
                "Platform analytics and improvement",
                "Usage, device data (aggregated / anonymised where possible)",
                "Legitimate use; Consent",
              ],
              [
                "Sending transactional communications (OTPs, invoices, receipts)",
                "Account data (email, phone)",
                "Consent; Performance of contract",
              ],
              [
                "Sending product updates and marketing (only with opt-in)",
                "Account data (email)",
                "Consent (separate, withdraw-able)",
              ],
              [
                "Statutory record-keeping (GST records, audit trails)",
                "Business & financial data",
                "Legal obligation (GST Act 2017, IT Act 2000)",
              ],
            ]}
          />

          {/* ── 6. Sensitive Data ── */}
          <SectionHeading id="sensitive-data" number="6" title="Sensitive Personal Data" />
          <LegalNote>
            <strong>SPDI Rules, 2011:</strong> Rule 3 of the IT (Reasonable Security Practices and
            Procedures and Sensitive Personal Data or Information) Rules, 2011 defines Sensitive
            Personal Data or Information (SPDI) to include passwords, financial information (bank
            account, credit/debit card details), and any information relating to tax identity. The{" "}
            <strong>DPDP Act, 2023</strong> designates certain categories of data as requiring
            heightened protection.
          </LegalNote>
          <P>
            BillingsEasy processes the following categories that qualify as sensitive or
            high-sensitivity personal data:
          </P>
          <SubHeading>6.1 Financial Information</SubHeading>
          <P>
            Bank account numbers and IFSC codes you enter are stored in encrypted form and are used
            solely for populating invoice templates and internal financial reconciliation. We do not
            store full credit or debit card numbers; payment card data is handled exclusively by our
            PCI-DSS compliant payment processor (Cashfree Payments) and is never transmitted to or
            stored on BillingsEasy servers.
          </P>
          <SubHeading>6.2 GSTIN and PAN</SubHeading>
          <P>
            Your GSTIN and PAN are tax identity numbers regulated under the GST Act, 2017 and the
            Income Tax Act, 1961. These identifiers are essential for core service functionality —
            without them, we cannot provide GST-compliant invoicing or tax return assistance. We
            collect and store these under your explicit consent and under our legal obligation to
            facilitate statutory compliance.
          </P>
          <SubHeading>6.3 Consent for SPDI</SubHeading>
          <P>
            In accordance with Rule 5 of the SPDI Rules, 2011, we obtain your explicit, informed,
            written (digital) consent before collecting sensitive personal data. You provide this
            consent when you complete your business profile or when you first provide such data
            through the Platform interface. You may withdraw consent at any time (see Section 11),
            subject to the consequence that withdrawal may impair our ability to provide the
            service.
          </P>

          {/* ── 7. How We Use Data ── */}
          <SectionHeading id="how-we-use" number="7" title="How We Use Your Data" />
          <SubHeading>7.1 Service Provision</SubHeading>
          <P>
            We use your account and business data to operate the Platform, authenticate your
            identity, maintain your account, and deliver the features you have subscribed to —
            including invoice creation, inventory management, party ledgers, expense tracking,
            payment records, and reporting dashboards.
          </P>
          <SubHeading>7.2 GST Compliance Assistance</SubHeading>
          <P>
            We process your transactional and business data to generate GSTR-1, GSTR-3B, and other
            GST return summaries; to compute tax liabilities and input tax credits; to generate
            e-invoices and retrieve IRN acknowledgements from the NIC/IRP; and to assist you in
            maintaining GST-compliant books of accounts. This processing is mandated by the GST Act,
            2017 and is carried out as a legal obligation and under your consent.
          </P>
          <SubHeading>7.3 Billing and Subscription Management</SubHeading>
          <P>
            We use your contact and payment details to process subscription fees, issue receipts,
            manage plan upgrades or downgrades, handle refunds, and maintain your billing history in
            compliance with applicable tax and accounting regulations.
          </P>
          <SubHeading>7.4 AI-Powered Features</SubHeading>
          <P>
            Where you use our "Ask AI" or other AI-assisted features, your query text and, where
            necessary for context, relevant business data (such as recent invoice summaries or
            expense totals) may be processed through our AI inference pipeline (which relies on
            Anthropic's Claude AI API). Data submitted to AI features is used solely to generate the
            response to your specific query and is not used to train AI models. We do not share your
            business data with Anthropic for any purpose other than generating your requested
            response, and Anthropic's API is governed by Anthropic's applicable data processing
            terms.
          </P>
          <SubHeading>7.5 Analytics and Platform Improvement</SubHeading>
          <P>
            Aggregated and, where practicable, anonymised or pseudonymised usage data is analysed to
            understand how users interact with the Platform, to identify areas for improvement, to
            measure the performance of new features, and to fix bugs. We do not use individually
            identifiable data for analytics where aggregate data is sufficient.
          </P>
          <SubHeading>7.6 Security and Fraud Prevention</SubHeading>
          <P>
            Device and usage data, including IP addresses and login timestamps, are analysed to
            detect unusual or potentially fraudulent activity, to prevent unauthorised access, and to
            protect the integrity of the Platform and the data of all users.
          </P>
          <SubHeading>7.7 Communications</SubHeading>
          <P>
            We use your email address and phone number to send you: (a) transactional messages
            necessary for the service (account confirmations, OTPs, invoice notifications, payment
            receipts, subscription alerts); and (b) where you have opted in, product updates,
            feature announcements, and promotional communications. You may opt out of marketing
            communications at any time by using the unsubscribe link in any such email or by
            contacting us.
          </P>

          {/* ── 8. Data Sharing ── */}
          <SectionHeading id="data-sharing" number="8" title="Data Sharing & Third Parties" />
          <P>
            BillingsEasy does not sell, rent, or trade your personal data to any third party for
            commercial purposes. We share personal data only in the following circumstances:
          </P>
          <SubHeading>8.1 Service Providers (Data Processors)</SubHeading>
          <P>
            We engage the following sub-processors who process personal data on our behalf and under
            our instructions. Each is bound by contractual obligations to maintain appropriate
            security standards:
          </P>
          <Table
            headers={["Provider", "Role", "Data Shared", "Purpose"]}
            rows={[
              [
                "Railway (railway.app)",
                "Cloud hosting — Backend API server",
                "All data processed by the API (account, business, transactional)",
                "Hosting and running our backend application and database infrastructure",
              ],
              [
                "MongoDB Atlas (MongoDB, Inc.)",
                "Database-as-a-Service",
                "All structured data stored in the application database",
                "Persistent storage of all application data including user accounts, invoices, and financial records",
              ],
              [
                "Anthropic, Inc. (Claude AI API)",
                "AI inference provider",
                "Query text and limited contextual business data submitted via Ask AI",
                "Processing natural-language queries and generating AI-powered insights; data not used for model training per API terms",
              ],
              [
                "Netlify, Inc.",
                "CDN & Frontend Hosting",
                "Static frontend assets; user IP addresses in access logs",
                "Delivering the web application interface via global content delivery network",
              ],
              [
                "Cashfree Payments (Cashfree Payments India Pvt. Ltd.)",
                "Payment gateway",
                "Name, email, phone, amount, order ID",
                "Processing subscription payments and issuing payment receipts",
              ],
            ]}
          />
          <SubHeading>8.2 Government and Regulatory Authorities</SubHeading>
          <P>
            We may disclose personal data to government bodies, regulatory agencies, courts, law
            enforcement authorities, or tax authorities (such as the GST Network, Income Tax
            Department, or any competent court or tribunal) when: (a) required by applicable law or
            valid legal process; (b) necessary to comply with a court order, subpoena, or regulatory
            direction; or (c) to protect the rights, property, or safety of BillingsEasy, its users,
            or the public.
          </P>
          <SubHeading>8.3 Business Transfers</SubHeading>
          <P>
            In the event of a merger, acquisition, restructuring, or sale of all or substantially
            all of BillingsEasy's business or assets, personal data held by us may be transferred to
            the acquiring entity as part of that transaction, subject to the acquiring entity
            assuming obligations no less protective than this Policy. We will notify you of any such
            transfer and any resulting changes to the processing of your data.
          </P>
          <SubHeading>8.4 With Your Consent</SubHeading>
          <P>
            We may share your personal data with additional third parties in circumstances not
            described above, where we have obtained your prior explicit consent for such sharing.
          </P>
          <P>
            We do not share personal data with advertisers or marketing networks.
          </P>

          {/* ── 9. Cross-Border Transfers ── */}
          <SectionHeading id="cross-border" number="9" title="Cross-Border Data Transfers" />
          <LegalNote>
            The <strong>DPDP Act, 2023</strong> (Section 16) grants the Central Government of India
            power to restrict or conditionally allow transfer of personal data to countries outside
            India. Until a "negative list" of restricted countries is notified by the Government,
            cross-border transfers are not prohibited by default, provided adequate safeguards are in
            place.
          </LegalNote>
          <P>
            Some of our service providers — including MongoDB Atlas, Anthropic (Claude AI API),
            Netlify, and Railway — are headquartered in the United States of America and may store
            or process your personal data on servers located outside India. By using the Platform
            and accepting this Policy, you acknowledge and consent to your personal data being
            transferred to and processed in countries outside India, including the United States.
          </P>
          <P>
            We take the following measures to ensure adequate protection for cross-border data
            transfers:
          </P>
          <Ul
            items={[
              "We enter into data processing agreements with all international sub-processors that impose obligations consistent with applicable Indian data protection law and, where applicable, internationally recognised standards such as ISO 27001",
              "We contractually require sub-processors to implement technical and organisational security measures appropriate to the risk of processing",
              "We minimise the personal data shared with international sub-processors to what is strictly necessary for the service",
              "We will comply with any restrictions or conditions on cross-border transfers notified by the Central Government under the DPDP Act, 2023 as and when they become effective",
            ]}
          />

          {/* ── 10. Retention ── */}
          <SectionHeading id="retention" number="10" title="Data Retention" />
          <P>
            We retain personal data for as long as necessary to fulfil the purposes for which it was
            collected, to provide the services, and to comply with our legal obligations. Our
            retention periods are guided by the nature of the data and applicable statutory
            requirements:
          </P>
          <Table
            headers={["Data Category", "Retention Period", "Legal Basis for Retention"]}
            rows={[
              [
                "Account data (name, email, phone, password hash)",
                "For the duration of your active account, plus 30 days after account deletion request to allow for reinstatement; thereafter deleted",
                "Contractual; DPDP Act 2023 (data minimisation principle)",
              ],
              [
                "Business data — invoices, GST records, financial transactions",
                "7 years from the end of the relevant financial year",
                "GST Act 2017 (Section 36 — mandatory 6-year record retention); Income Tax Act 1961 (Section 44AA — 6 years); IT Act 2000",
              ],
              [
                "Bank account and payment details",
                "Duration of account + 7 years for financial audit trail",
                "RBI guidelines; Companies Act 2013 (if applicable); contractual",
              ],
              [
                "Server and access logs",
                "90 days from creation, then auto-purged",
                "IT (Intermediary Guidelines) Rules 2021 (Rule 3(1)(j) — minimum 3-month log retention); security monitoring",
              ],
              [
                "AI query logs (Ask AI conversations)",
                "90 days, then permanently deleted",
                "Consent; data minimisation",
              ],
              [
                "Cookies and analytics data",
                "As specified in Section 12; session cookies deleted on browser close; persistent cookies up to 12 months",
                "Consent",
              ],
              [
                "Support and grievance communications",
                "3 years from resolution date",
                "Consumer Protection Act 2019; legal claims limitation period",
              ],
              [
                "Data of deleted accounts (residual backup copies)",
                "Purged from backups within 90 days of account deletion",
                "Technical necessity; DPDP Act 2023 erasure obligations",
              ],
            ]}
          />
          <P>
            Upon expiry of the applicable retention period, we will either securely delete the data
            or anonymise it such that it can no longer be linked to any identifiable individual or
            business.
          </P>

          {/* ── 11. Your Rights ── */}
          <SectionHeading id="your-rights" number="11" title="Your Rights Under the DPDP Act, 2023" />
          <LegalNote>
            Chapter III of the <strong>Digital Personal Data Protection Act, 2023</strong> (Sections
            11–14) confers the following rights on every "Data Principal" (i.e., the individual to
            whom the personal data relates). BillingsEasy is committed to facilitating the exercise
            of these rights within the timelines prescribed by law.
          </LegalNote>
          <SubHeading>11.1 Right to Access Information (Section 11)</SubHeading>
          <P>
            You have the right to obtain from us: (a) a summary of the personal data we process
            about you; (b) the identities of all Data Fiduciaries and Data Processors with whom we
            have shared your data; and (c) any other information relating to the processing of your
            data as may be prescribed. To exercise this right, submit a written request to our
            Grievance Officer (see Section 15). We will respond within 30 days.
          </P>
          <SubHeading>11.2 Right to Correction and Erasure (Section 12)</SubHeading>
          <P>
            You have the right to request that we: (a) correct any inaccurate or misleading personal
            data; (b) complete any incomplete personal data; and (c) update personal data that is no
            longer current. You may also request the erasure of personal data that is no longer
            necessary for the purpose for which it was collected, subject to our retention
            obligations under law (see Section 10). Requests for erasure of data required for legal
            compliance (such as GST records) may be declined for the duration of the mandatory
            retention period.
          </P>
          <P>
            Many account data corrections (name, email, phone, business details) can be performed
            directly through the Settings section of your account dashboard without needing to
            contact us.
          </P>
          <SubHeading>11.3 Right to Withdraw Consent (Section 6(4))</SubHeading>
          <P>
            Where our processing of your personal data is based on your consent, you have the right
            to withdraw that consent at any time. Withdrawal of consent will not affect the
            lawfulness of processing carried out before the withdrawal. You may withdraw consent by:
            (a) adjusting your account settings; (b) using the unsubscribe mechanism in any
            marketing email; or (c) contacting our Grievance Officer. Please note that withdrawal of
            consent for certain core processing (e.g., processing your GSTIN for invoice generation)
            will necessarily impair our ability to provide the service.
          </P>
          <SubHeading>11.4 Right to Grievance Redressal (Section 13)</SubHeading>
          <P>
            You have the right to have your grievances related to the processing of your personal
            data addressed by our Grievance Officer within 30 days of receipt. Details of our
            Grievance Officer and the escalation pathway to the Data Protection Board of India are
            set out in Section 15.
          </P>
          <SubHeading>11.5 Right to Nominate (Section 14)</SubHeading>
          <P>
            You have the right to nominate any other individual who shall, in the event of your
            death or incapacity, exercise your rights under the DPDP Act with respect to your
            personal data. To register a nominee, please contact our Grievance Officer with the
            nominee's name and contact details.
          </P>
          <SubHeading>11.6 Additional Rights Under SPDI Rules, 2011</SubHeading>
          <P>
            Under Rule 5(6) of the SPDI Rules, 2011, you have the right to review and correct the
            sensitive personal data or information that you have provided to us. You may exercise
            this right by logging into your account and editing your business profile, or by
            contacting our Grievance Officer.
          </P>
          <SubHeading>How to Exercise Your Rights</SubHeading>
          <P>
            To exercise any of the above rights, contact our Grievance Officer at{" "}
            <a
              href="mailto:vijayakumartech1@gmail.com"
              className="text-blue-600 hover:underline"
            >
              vijayakumartech1@gmail.com
            </a>{" "}
            with the subject line "<strong>Data Rights Request — [Your Name]</strong>". We may
            require you to verify your identity before processing your request. We will respond
            within 30 days.
          </P>

          {/* ── 12. Cookies ── */}
          <SectionHeading id="cookies" number="12" title="Cookies & Tracking" />
          <P>
            BillingsEasy uses cookies and similar technologies (local storage, session storage) to
            operate and improve the Platform. By accessing the Platform, you consent to the use of
            cookies as described in this section. You may withdraw consent for non-essential cookies
            at any time through your browser settings or, where applicable, through our cookie
            preference centre.
          </P>
          <Table
            headers={["Cookie Type", "Examples", "Purpose", "Duration"]}
            rows={[
              [
                "Strictly Necessary",
                "auth_token, session_id",
                "Required to authenticate you and maintain your login session. The Platform cannot function without these.",
                "Session (deleted on browser close) or up to 30 days for 'remember me'",
              ],
              [
                "Functional / Preference",
                "theme_pref, language",
                "Remember your display preferences (dark/light mode, language) so you don't need to re-set them each visit.",
                "Up to 12 months",
              ],
              [
                "Analytics",
                "Analytics provider cookies",
                "Collect anonymised data on page visits, feature usage, and session duration to help us improve the Platform.",
                "Up to 12 months",
              ],
              [
                "Security",
                "csrf_token",
                "Protect against cross-site request forgery and other security threats.",
                "Session",
              ],
            ]}
          />
          <SubHeading>12.1 Managing Cookies</SubHeading>
          <P>
            You can control and manage cookies through your browser settings. Most browsers allow
            you to refuse all cookies, accept only certain cookies, or delete cookies after each
            session. Please note that disabling strictly necessary cookies will prevent you from
            logging in to and using the Platform. To learn how to manage cookies in your browser,
            visit the help section of your browser or refer to resources such as{" "}
            <span className="font-medium">www.allaboutcookies.org</span>.
          </P>
          <P>
            We do not use advertising or cross-site tracking cookies. We do not allow third-party
            advertising networks to place cookies on our Platform.
          </P>

          {/* ── 13. Children's Privacy ── */}
          <SectionHeading id="childrens-privacy" number="13" title="Children's Privacy" />
          <LegalNote>
            <strong>DPDP Act, 2023 — Section 9:</strong> Processing of personal data of children
            (persons below 18 years of age) is subject to special safeguards. A Data Fiduciary must
            obtain verifiable consent of the parent or lawful guardian before processing any personal
            data of a child, and must not process personal data of a child in a manner that is
            detrimental to the child.
          </LegalNote>
          <P>
            The Platform is designed for use by businesses and their authorised adult
            representatives. BillingsEasy does not knowingly collect personal data from any person
            under the age of 18 ("<strong>child</strong>") without verifiable parental or guardian
            consent.
          </P>
          <P>
            If you are a parent or guardian and you believe that your child has provided us with
            personal data without your consent, please contact us immediately at{" "}
            <a
              href="mailto:vijayakumartech1@gmail.com"
              className="text-blue-600 hover:underline"
            >
              vijayakumartech1@gmail.com
            </a>
            . We will investigate and, where confirmed, promptly delete such data from our systems.
          </P>
          <P>
            If a business operated or represented by a child (as may be permitted under applicable
            law in limited circumstances) seeks to use our Platform, such use must be with the
            prior, written, verifiable consent of the child's parent or lawful guardian. Accounts
            found to be operated by individuals under 18 without such consent will be suspended
            pending verification.
          </P>

          {/* ── 14. Security ── */}
          <SectionHeading id="security" number="14" title="Security Measures" />
          <LegalNote>
            <strong>IT Act, 2000 — Section 43A</strong> and the{" "}
            <strong>SPDI Rules, 2011 (Rules 8 & 9)</strong> require bodies corporate that possess,
            deal, or handle sensitive personal data or information to implement and maintain
            reasonable security practices and procedures. BillingsEasy implements the following
            technical and organisational measures:
          </LegalNote>
          <SubHeading>14.1 Encryption</SubHeading>
          <Ul
            items={[
              "All data in transit is encrypted using TLS 1.2 or higher (HTTPS). Unencrypted HTTP connections are rejected or redirected.",
              "Sensitive fields (bank account numbers, PAN, GSTIN) stored in the database are encrypted at the field level using industry-standard AES-256 encryption.",
              "User passwords are never stored in plain text; they are processed using bcrypt (cost factor ≥ 12) before storage.",
              "Database storage is encrypted at rest by our database provider (MongoDB Atlas), which uses AES-256 encryption.",
            ]}
          />
          <SubHeading>14.2 Authentication and Access Control</SubHeading>
          <Ul
            items={[
              "API authentication uses JSON Web Tokens (JWT) with short expiry periods and secure signing algorithms (RS256 / HS256).",
              "Multi-factor authentication (OTP-based) is offered for sensitive account operations.",
              "Role-based access controls (RBAC) are implemented so that staff or sub-users can only access the data and functions their role permits.",
              "Internal access to production systems is restricted to authorised personnel on a least-privilege basis.",
              "All administrative access is logged and reviewed periodically.",
            ]}
          />
          <SubHeading>14.3 Infrastructure Security</SubHeading>
          <Ul
            items={[
              "Application and database servers are hosted on cloud infrastructure with network-level firewalls and isolation.",
              "Regular automated and manual security assessments, including vulnerability scanning, are conducted.",
              "Database backups are encrypted and stored in geographically separated locations with restricted access.",
              "Dependencies and libraries are regularly updated to address known security vulnerabilities.",
            ]}
          />
          <SubHeading>14.4 Organisational Measures</SubHeading>
          <Ul
            items={[
              "Personnel with access to personal data are bound by confidentiality obligations.",
              "A data breach response procedure is in place. In the event of a personal data breach that is likely to result in harm to Data Principals, we will notify affected individuals and, where required by law, the Data Protection Board of India within the prescribed timeframe.",
              "We conduct periodic reviews of our privacy and security practices.",
            ]}
          />
          <P>
            Despite these measures, no system is completely secure. You acknowledge that transmission
            of data over the internet carries inherent risk, and we cannot guarantee absolute
            security. If you suspect any unauthorised access to your account, please change your
            password immediately and contact us.
          </P>

          {/* ── 15. Grievance ── */}
          <SectionHeading id="grievance" number="15" title="Grievance Redressal" />
          <LegalNote>
            <strong>IT Rules, 2011 — Rule 5(9):</strong> Every body corporate or person on behalf
            of the body corporate shall designate a Grievance Officer to address any discrepancies
            and grievances of the provider of information. The name and contact details of the
            Grievance Officer shall be published on the website. The Grievance Officer shall redress
            the grievances of the provider of information within one month (30 days) from the date
            of receipt of grievance. The same obligations apply to intermediaries under the IT
            (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021.
          </LegalNote>
          <SubHeading>15.1 Grievance Officer</SubHeading>
          <P>
            In accordance with Rule 5(9) of the SPDI Rules, 2011 and the applicable provisions of
            the DPDP Act, 2023, the following individual has been designated as the Grievance
            Officer for BillingsEasy:
          </P>
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-6 text-sm space-y-2">
            <div className="flex gap-2">
              <span className="font-semibold text-gray-700 dark:text-gray-300 w-36">Name:</span>
              <span className="text-gray-900 dark:text-white font-medium">Vijay Kumar</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-gray-700 dark:text-gray-300 w-36">
                Designation:
              </span>
              <span className="text-gray-900 dark:text-white">
                Grievance Officer, BillingsEasy
              </span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-gray-700 dark:text-gray-300 w-36">Email:</span>
              <a
                href="mailto:vijayakumartech1@gmail.com"
                className="text-blue-600 hover:underline"
              >
                vijayakumartech1@gmail.com
              </a>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-gray-700 dark:text-gray-300 w-36">
                Response Time:
              </span>
              <span className="text-gray-900 dark:text-white">
                Within 30 days of receipt of grievance
              </span>
            </div>
          </div>
          <SubHeading>15.2 How to File a Grievance</SubHeading>
          <P>
            If you have any concern, complaint, or grievance regarding the collection, storage,
            processing, disclosure, or any other aspect of handling of your personal data by
            BillingsEasy, you may submit a grievance to the Grievance Officer by email at{" "}
            <a
              href="mailto:vijayakumartech1@gmail.com"
              className="text-blue-600 hover:underline"
            >
              vijayakumartech1@gmail.com
            </a>{" "}
            with the subject line "<strong>Privacy Grievance — [Your Name / Account Email]</strong>
            ". Your grievance should include:
          </P>
          <Ul
            items={[
              "Your full name and the email address associated with your BillingsEasy account",
              "A clear description of the grievance and the specific personal data or processing activity it concerns",
              "Any relevant dates, reference numbers, or supporting documentation",
              "The remedy or resolution you are seeking",
            ]}
          />
          <P>
            We will acknowledge receipt of your grievance within 3 business days and aim to resolve
            it within 30 days. If resolution requires additional time or information, we will inform
            you accordingly.
          </P>
          <SubHeading>15.3 Escalation — Data Protection Board of India</SubHeading>
          <P>
            If you are not satisfied with the resolution offered by our Grievance Officer, or if we
            fail to respond within the prescribed period, you have the right to escalate the matter
            to the <strong>Data Protection Board of India</strong> (the statutory authority
            established under Section 18 of the DPDP Act, 2023). The Board has the authority to
            conduct inquiries, impose penalties, and award compensation. Details of the Board and
            the complaint mechanism will be published by the Ministry of Electronics and Information
            Technology (MeitY) upon the Board's operationalisation.
          </P>
          <SubHeading>15.4 Consumer Grievances</SubHeading>
          <P>
            If your grievance relates to deficiency in service, unfair trade practice, or consumer
            rights under the <strong>Consumer Protection Act, 2019</strong>, you may also approach
            the relevant Consumer Disputes Redressal Commission (District, State, or National level,
            depending on the value of the claim) or file a complaint through the Central Consumer
            Protection Authority (CCPA) or the National Consumer Helpline (NCH).
          </P>

          {/* ── 16. Changes ── */}
          <SectionHeading id="changes" number="16" title="Changes to This Policy" />
          <P>
            We may update this Privacy Policy from time to time to reflect changes in our data
            processing practices, the services we offer, applicable law, or regulatory requirements.
            When we make material changes, we will:
          </P>
          <Ul
            items={[
              "Update the 'Last Updated' date at the top of this page",
              "Display a prominent notice on the Platform or send you an email notification to the address associated with your account, at least 7 days before the revised Policy takes effect (or earlier if required by law)",
              "Where required by the DPDP Act, 2023, seek fresh consent for any new or materially changed processing activities",
            ]}
          />
          <P>
            Non-material changes (such as typographical corrections, formatting changes, or
            clarifications that do not alter the substance of the Policy) may be made without prior
            notice, though the 'Last Updated' date will always be revised.
          </P>
          <P>
            Your continued use of the Platform after a revised Policy becomes effective constitutes
            your acceptance of the changes to the extent permitted by applicable law. If you do not
            agree with any revised Policy, you should stop using the Platform and may request
            deletion of your account.
          </P>
          <P>
            We encourage you to review this Policy periodically to stay informed about how we are
            protecting your personal data.
          </P>

          {/* ── 17. Contact ── */}
          <SectionHeading id="contact" number="17" title="Contact Us" />
          <P>
            If you have any questions, concerns, or requests related to this Privacy Policy or the
            handling of your personal data that are not covered by the Grievance Redressal process,
            you may reach us through the following channels:
          </P>
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-6 text-sm space-y-3">
            <div className="flex gap-2 items-start">
              <span className="font-semibold text-gray-700 dark:text-gray-300 w-36">
                Business:
              </span>
              <span className="text-gray-900 dark:text-white">BillingsEasy</span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="font-semibold text-gray-700 dark:text-gray-300 w-36">
                Operated by:
              </span>
              <span className="text-gray-900 dark:text-white">Vijay Kumar</span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="font-semibold text-gray-700 dark:text-gray-300 w-36">Email:</span>
              <a
                href="mailto:vijayakumartech1@gmail.com"
                className="text-blue-600 hover:underline"
              >
                vijayakumartech1@gmail.com
              </a>
            </div>
            <div className="flex gap-2 items-start">
              <span className="font-semibold text-gray-700 dark:text-gray-300 w-36">Website:</span>
              <a
                href="https://billingeasy.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline flex items-center gap-1"
              >
                https://billingeasy.com <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <P>
            We will endeavour to respond to all general enquiries within 5 business days. For
            formal grievances, the timelines set out in Section 15 apply.
          </P>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800 text-center text-xs text-gray-500 dark:text-gray-500 space-y-1">
            <p>
              © {new Date().getFullYear()} BillingsEasy. Operated by Vijay Kumar. All rights
              reserved.
            </p>
            <p>
              This Privacy Policy is effective from <strong>July 2026</strong> and was last updated
              on <strong>July 4, 2026</strong>.
            </p>
            <p className="mt-2">
              Governed by the laws of the Republic of India. Disputes subject to the jurisdiction
              of competent courts in India.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
