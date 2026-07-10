// Security Policy page — BillingsEasy
// Legal framework: IT Rules 2011, IT Act 2000 s.43A, DPDP Act 2023, ISO/IEC 27001, CERT-In
import {
  Shield,
  Lock,
  Server,
  Code2,
  Database,
  UserCheck,
  CreditCard,
  Bot,
  AlertTriangle,
  Activity,
  Users,
  RefreshCw,
  FileCheck,
  Wrench,
  Mail,
  CheckCircle2,
} from "lucide-react";

const SECTIONS = [
  {
    id: "commitment",
    icon: Shield,
    color: "green",
    title: "1. Our Security Commitment",
    content: (
      <>
        <p>
          BillingsEasy ("we", "our", "the Company") is committed to maintaining the security
          and confidentiality of all data entrusted to us by our users. This commitment is
          anchored in India's legal framework, specifically:
        </p>
        <ul>
          <li>
            <strong>Section 43A of the Information Technology Act, 2000</strong> — which
            mandates that body corporates handling sensitive personal data implement and
            maintain reasonable security practices and procedures.
          </li>
          <li>
            <strong>IT (Reasonable Security Practices and Procedures and Sensitive Personal
            Data or Information) Rules, 2011</strong> — which specify the standards of security
            required for sensitive personal data such as financial information, passwords, and
            transaction details.
          </li>
          <li>
            <strong>Digital Personal Data Protection (DPDP) Act, 2023</strong> — India's
            comprehensive personal data protection legislation, which establishes obligations
            for Data Fiduciaries processing digital personal data.
          </li>
        </ul>
        <p>
          We also align our information security management practices with the principles of{" "}
          <strong>ISO/IEC 27001</strong> as a best-practice framework, and follow guidance
          issued by the <strong>Indian Computer Emergency Response Team (CERT-In)</strong>.
        </p>
      </>
    ),
  },
  {
    id: "infrastructure",
    icon: Server,
    color: "blue",
    title: "2. Infrastructure Security",
    content: (
      <>
        <p>BillingsEasy is hosted on <strong>Railway</strong>, a managed cloud infrastructure platform that provides:</p>
        <ul>
          <li>Physical security and access controls at data centre level.</li>
          <li>Network-level DDoS protection and traffic filtering.</li>
          <li>Isolated container environments per deployment, minimising blast radius in the event of a compromise.</li>
          <li>Automatic failover and redundancy across Railway's infrastructure regions.</li>
        </ul>
        <p>
          All traffic between users' browsers and our servers is encrypted using{" "}
          <strong>HTTPS with TLS 1.3</strong> — the current industry-best transport security
          protocol. Plaintext HTTP connections are redirected to HTTPS automatically.
        </p>
        <p>
          Our <strong>MongoDB</strong> database is configured with{" "}
          <strong>encryption at rest</strong>, meaning data stored on disk is encrypted even
          if physical storage media were to be accessed by an unauthorised party.
        </p>
      </>
    ),
  },
  {
    id: "application",
    icon: Code2,
    color: "blue",
    title: "3. Application Security",
    content: (
      <>
        <p>Our application layer employs multiple defensive controls:</p>
        <ul>
          <li>
            <strong>JWT Authentication:</strong> All authenticated API requests require a
            signed JSON Web Token (JWT). Tokens are short-lived and must be refreshed
            periodically. Expired or tampered tokens are rejected.
          </li>
          <li>
            <strong>bcrypt Password Hashing:</strong> User passwords are never stored in
            plaintext. We use bcrypt with a high work factor, meaning even if our database
            were compromised, passwords could not be trivially reversed.
          </li>
          <li>
            <strong>Rate Limiting:</strong> All authentication endpoints (login, register,
            password reset) are rate-limited to prevent brute-force attacks and credential
            stuffing.
          </li>
          <li>
            <strong>Input Validation & Sanitisation:</strong> All user-supplied inputs are
            validated on both the client and server side. We use strict schema validation to
            reject unexpected or malformed data before it reaches our database.
          </li>
          <li>
            <strong>CORS Policy:</strong> Our API enforces a strict Cross-Origin Resource
            Sharing (CORS) policy, permitting requests only from our authorised front-end
            origins.
          </li>
          <li>
            <strong>Security Headers:</strong> HTTP security headers (including
            Content-Security-Policy, X-Frame-Options, and X-Content-Type-Options) are set on
            all responses to mitigate common web vulnerabilities.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "encryption",
    icon: Lock,
    color: "green",
    title: "4. Data Encryption",
    content: (
      <>
        <p>We protect data at every stage of its lifecycle:</p>
        <ul>
          <li>
            <strong>In Transit:</strong> All data transmitted between users and our servers
            — and between our servers and third-party APIs — is encrypted using{" "}
            <strong>TLS 1.2 or TLS 1.3</strong>. We do not support deprecated protocols
            (SSL 3.0, TLS 1.0, TLS 1.1).
          </li>
          <li>
            <strong>At Rest:</strong> Databases are encrypted at rest using{" "}
            <strong>AES-256</strong>, the symmetric encryption standard used by government
            and financial institutions worldwide. This applies to all user business data
            stored in MongoDB.
          </li>
          <li>
            <strong>Backups:</strong> Database backups are also encrypted using the same
            AES-256 standard and stored securely.
          </li>
        </ul>
        <p>
          Under Rule 8 of the IT (SPDI) Rules 2011, we are required to implement a
          comprehensive documented information security programme. Encryption is a core
          component of that programme.
        </p>
      </>
    ),
  },
  {
    id: "access",
    icon: UserCheck,
    color: "green",
    title: "5. Access Controls",
    content: (
      <>
        <p>Access to data and system resources is governed by the principle of least privilege:</p>
        <ul>
          <li>
            <strong>Role-Based Access Control (RBAC):</strong> Within BillingsEasy, user
            accounts are assigned roles (e.g., admin, cashier, staff). Each role has a
            predefined set of permissions. Users cannot access data or perform actions beyond
            their assigned role.
          </li>
          <li>
            <strong>Multi-Organisation Isolation:</strong> Data belonging to one business
            organisation is strictly isolated from all others at the database query level.
            Cross-organisation data access is architecturally prevented.
          </li>
          <li>
            <strong>Principle of Least Privilege:</strong> Internal system components and
            microservices are granted only the minimum permissions required for their
            designated function.
          </li>
          <li>
            <strong>Session Management:</strong> User sessions are invalidated upon logout.
            Inactive sessions are automatically expired after a defined idle timeout.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "payment",
    icon: CreditCard,
    color: "blue",
    title: "6. Payment Security",
    content: (
      <>
        <p>
          All payment processing on BillingsEasy is handled by{" "}
          <strong>Cashfree Payments</strong>, a PCI-DSS Level 1 compliant payment gateway —
          the highest level of PCI compliance. This means:
        </p>
        <ul>
          <li>
            Card numbers, CVVs, expiry dates, and other cardholder data are processed
            entirely within Cashfree's certified secure environment.
          </li>
          <li>
            <strong>BillingsEasy never stores, processes, or transmits raw card numbers.</strong>{" "}
            We receive only tokenised payment references and transaction status from Cashfree.
          </li>
          <li>
            Cashfree's PCI-DSS certification is independently audited annually by a Qualified
            Security Assessor (QSA).
          </li>
          <li>
            UPI and wallet payments are processed via regulated payment aggregators and are
            subject to RBI guidelines.
          </li>
        </ul>
        <p>
          Our scoped PCI posture is intentionally minimal: by not handling card data, we
          eliminate an entire class of payment security risk for our users.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    icon: Bot,
    color: "blue",
    title: "7. AI Data Security",
    content: (
      <>
        <p>
          BillingsEasy's AI features (including the "Ask AI" assistant and AI-assisted invoice
          creation) are powered by the <strong>Anthropic Claude API</strong>. When you use
          these features:
        </p>
        <ul>
          <li>
            Queries and relevant business context are transmitted to Anthropic's API over an
            encrypted TLS connection.
          </li>
          <li>
            <strong>
              Per Anthropic's enterprise API policy, data submitted via the Claude API is not
              used to train Anthropic's models.
            </strong>{" "}
            Your business data remains your data.
          </li>
          <li>
            We transmit only the minimum data necessary to answer each query. We do not send
            bulk data exports to the AI API.
          </li>
          <li>
            Anthropic maintains its own security programme. For details, refer to{" "}
            <a
              href="https://www.anthropic.com/security"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              anthropic.com/security
            </a>
            .
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "disclosure",
    icon: AlertTriangle,
    color: "yellow",
    title: "8. Vulnerability Disclosure / Responsible Disclosure Policy",
    content: (
      <>
        <p>
          We welcome good-faith security research. If you discover a vulnerability in
          BillingsEasy, please report it to us responsibly before making it public.
        </p>
        <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-4 mb-2">How to report:</h4>
        <ul>
          <li>
            Send an email to{" "}
            <a
              href="mailto:vijayakumartech1@gmail.com"
              className="text-blue-600 hover:underline"
            >
              vijayakumartech1@gmail.com
            </a>{" "}
            with the subject line beginning with <strong>"SECURITY:"</strong>
          </li>
          <li>
            Include a description of the vulnerability, the affected component, steps to
            reproduce, and your assessment of potential impact.
          </li>
          <li>
            We aim to <strong>acknowledge your report within 48 hours</strong> and provide a
            remediation timeline within 7 business days.
          </li>
        </ul>
        <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-4 mb-2">Our commitments to researchers:</h4>
        <ul>
          <li>
            We will not initiate legal action against researchers who act in good faith,
            follow this disclosure policy, and do not exploit vulnerabilities beyond what is
            necessary to demonstrate the issue.
          </li>
          <li>We will credit researchers (with permission) upon resolution.</li>
          <li>
            Good faith is defined as: not accessing, modifying, or deleting user data; not
            performing denial-of-service attacks; not using social engineering against our
            team or users.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "incident",
    icon: Activity,
    color: "red",
    title: "9. Incident Response",
    content: (
      <>
        <p>
          In the event of a security incident, BillingsEasy follows a documented Incident
          Response Plan:
        </p>
        <ul>
          <li>
            <strong>Detection & Containment:</strong> Our monitoring systems are configured to
            alert on anomalous activity. On detection of a suspected incident, we immediately
            initiate containment procedures to limit exposure.
          </li>
          <li>
            <strong>CERT-In Reporting Obligation:</strong> In accordance with CERT-In
            directions (issued April 2022), certain categories of cybersecurity incidents must
            be reported to CERT-In within <strong>6 hours</strong> of detection. We maintain
            procedures to meet this obligation for qualifying incidents.
          </li>
          <li>
            <strong>User Notification:</strong> If a security incident results in the
            unauthorised access or disclosure of your personal or business data, we will
            notify affected users <strong>within 72 hours</strong> of confirming the breach,
            in line with the DPDP Act 2023 and IT Rules 2011 notification requirements.
            Notification will be provided via the email address on record.
          </li>
          <li>
            <strong>Post-Incident Review:</strong> Following any significant incident, we
            conduct a root cause analysis and implement remediation measures to prevent
            recurrence.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "employee",
    icon: Users,
    color: "blue",
    title: "10. Employee & Contractor Access",
    content: (
      <>
        <p>We apply strict controls to all internal access to production systems and user data:</p>
        <ul>
          <li>
            <strong>Minimal Access:</strong> Employees and contractors are granted access only
            to the systems and data required for their specific role. Production database
            access is restricted to essential personnel.
          </li>
          <li>
            <strong>NDA Required:</strong> All employees and contractors with potential access
            to customer data are required to sign Non-Disclosure Agreements (NDAs) prior to
            being granted access.
          </li>
          <li>
            <strong>Access Logging:</strong> All administrative access to production
            infrastructure and databases is logged with timestamps and user identity. Logs are
            retained for audit purposes.
          </li>
          <li>
            <strong>Access Revocation:</strong> Access is revoked promptly upon termination of
            employment or contract. We maintain an off-boarding checklist to ensure all
            credentials and access tokens are invalidated.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "continuity",
    icon: RefreshCw,
    color: "green",
    title: "11. Business Continuity & Backups",
    content: (
      <>
        <p>We maintain business continuity measures to ensure availability and recoverability of your data:</p>
        <ul>
          <li>
            <strong>Daily Backups:</strong> Automated daily backups of all database data are
            performed. Backups are encrypted and retained for a rolling period to enable
            point-in-time recovery.
          </li>
          <li>
            <strong>Railway Infrastructure Redundancy:</strong> Our deployment on Railway
            benefits from platform-level redundancy and automatic restarts in the event of
            container or process failures.
          </li>
          <li>
            <strong>Recovery Testing:</strong> We periodically test our backup and recovery
            procedures to verify that data can be restored within our defined Recovery Time
            Objectives (RTOs).
          </li>
          <li>
            <strong>Monitoring & Alerting:</strong> Uptime monitoring and alerting is in
            place to detect and respond to service degradation promptly.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "compliance",
    icon: FileCheck,
    color: "blue",
    title: "12. Compliance",
    content: (
      <>
        <p>BillingsEasy's security programme is designed to comply with applicable Indian laws and regulatory frameworks:</p>
        <ul>
          <li>
            <strong>Information Technology Act, 2000 (IT Act):</strong> We comply with the
            provisions of the IT Act, including Section 43A (compensation for failure to
            protect data) and Section 72A (punishment for disclosure of information in breach
            of lawful contract).
          </li>
          <li>
            <strong>IT (SPDI) Rules, 2011:</strong> We implement and maintain reasonable
            security practices as defined under Rule 8, including our information security
            policy, programme, and procedures.
          </li>
          <li>
            <strong>Digital Personal Data Protection (DPDP) Act, 2023:</strong> As a Data
            Fiduciary, we fulfil our obligations with respect to lawful processing, purpose
            limitation, data minimisation, accuracy, storage limitation, and security
            safeguards as prescribed under the DPDP Act 2023.
          </li>
          <li>
            <strong>CERT-In Guidelines:</strong> We follow guidelines and directives issued by
            the Indian Computer Emergency Response Team, including mandatory incident reporting
            timelines and vulnerability management best practices.
          </li>
          <li>
            <strong>ISO/IEC 27001 (Best Practice Alignment):</strong> While BillingsEasy is
            not currently ISO 27001 certified, we align our information security management
            practices with the ISO 27001 framework as a recognised best-practice standard.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "patching",
    icon: Wrench,
    color: "blue",
    title: "13. Security Updates & Patching",
    content: (
      <>
        <p>
          Keeping our software dependencies and infrastructure up to date is a core part of
          our security posture:
        </p>
        <ul>
          <li>
            <strong>Dependency Monitoring:</strong> We use automated tools to monitor our
            software dependencies for known vulnerabilities (CVEs).
          </li>
          <li>
            <strong>Patching SLA:</strong> We apply security patches for critical and
            high-severity vulnerabilities{" "}
            <strong>within 30 days of the patch being released</strong> by the upstream
            maintainer. Critical zero-day vulnerabilities are prioritised for immediate
            remediation.
          </li>
          <li>
            <strong>Operating System & Runtime Updates:</strong> Infrastructure-level patches
            (OS, runtime environments) are applied in coordination with our hosting
            provider's maintenance windows.
          </li>
          <li>
            <strong>Pre-deployment Testing:</strong> Security patches are tested in a staging
            environment before being deployed to production to prevent unintended regressions.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "contact",
    icon: Mail,
    color: "green",
    title: "14. Contact for Security Issues",
    content: (
      <>
        <p>
          For all security-related enquiries, vulnerability reports, or concerns about the
          security of your data, please contact us at:
        </p>
        <div className="mt-4 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-xl">
          <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Security Contact</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Email:{" "}
            <a
              href="mailto:vijayakumartech1@gmail.com"
              className="text-blue-600 hover:underline font-medium"
            >
              vijayakumartech1@gmail.com
            </a>
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Please mark your email subject with <strong>"SECURITY:"</strong> so we can
            prioritise and route your message appropriately.
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            We aim to acknowledge all security reports within <strong>48 hours</strong>.
          </p>
        </div>
        <p className="mt-4">
          For general (non-security) support, visit{" "}
          <a
            href="https://billingseasy.com"
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            billingseasy.com
          </a>{" "}
          or email{" "}
          <a href="mailto:hello@billingseasy.com" className="text-blue-600 hover:underline">
            hello@billingseasy.com
          </a>
          .
        </p>
      </>
    ),
  },
];

const COLOR_MAP = {
  green: {
    bg: "bg-green-50 dark:bg-green-950/30",
    icon: "bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400",
    border: "border-green-200 dark:border-green-900",
    dot: "bg-green-500",
  },
  blue: {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    icon: "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-900",
    dot: "bg-blue-500",
  },
  yellow: {
    bg: "bg-yellow-50 dark:bg-yellow-950/30",
    icon: "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-600 dark:text-yellow-400",
    border: "border-yellow-200 dark:border-yellow-900",
    dot: "bg-yellow-500",
  },
  red: {
    bg: "bg-red-50 dark:bg-red-950/30",
    icon: "bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400",
    border: "border-red-200 dark:border-red-900",
    dot: "bg-red-500",
  },
};

export default function Security() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-br from-green-700 via-emerald-700 to-blue-800 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur mb-6">
            <Shield className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4 tracking-tight">Security Policy</h1>
          <p className="text-green-200 text-lg max-w-2xl mx-auto leading-relaxed mb-6">
            How BillingsEasy protects your business data. Compliant with IT Act 2000, IT
            (SPDI) Rules 2011, DPDP Act 2023, and CERT-In guidelines.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur text-sm text-green-100">
            <CheckCircle2 className="h-4 w-4 text-green-300" />
            Last updated: July 4, 2026 · Effective: July 2026
          </div>
        </div>
      </div>

      {/* Quick nav chips */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {SECTIONS.map((s) => {
              const c = COLOR_MAP[s.color];
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors hover:opacity-80 ${c.bg} ${c.border} text-slate-700 dark:text-slate-300`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                  {s.title.replace(/^\d+\.\s+/, "")}
                </a>
              );
            })}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-8">
        {/* Intro box */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
            This Security Policy describes the technical and organisational measures BillingsEasy
            implements to protect the confidentiality, integrity, and availability of data stored on
            our platform. It applies to all users of{" "}
            <a href="https://billingseasy.com" className="text-blue-600 hover:underline">
              billingseasy.com
            </a>{" "}
            and the BillingsEasy application. This policy should be read alongside our{" "}
            <a href="/privacy" className="text-blue-600 hover:underline">
              Privacy Policy
            </a>{" "}
            and{" "}
            <a href="/terms" className="text-blue-600 hover:underline">
              Terms of Service
            </a>
            .
          </p>
        </div>

        {/* Sections */}
        {SECTIONS.map((section) => {
          const c = COLOR_MAP[section.color];
          const Icon = section.icon;
          return (
            <section
              key={section.id}
              id={section.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden scroll-mt-16"
            >
              {/* Section header */}
              <div className={`px-6 py-4 border-b ${c.bg} ${c.border} flex items-center gap-3`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${c.icon}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="font-bold text-slate-900 dark:text-white text-lg leading-tight">
                  {section.title}
                </h2>
              </div>
              {/* Section body */}
              <div className="px-6 py-5 prose-security text-sm text-slate-600 dark:text-slate-400 leading-relaxed space-y-3 [&_p]:leading-relaxed [&_ul]:mt-2 [&_ul]:ml-4 [&_ul]:space-y-2 [&_ul]:list-disc [&_li]:leading-relaxed [&_strong]:text-slate-800 dark:[&_strong]:text-slate-200 [&_a]:text-blue-600 [&_a:hover]:underline">
                {section.content}
              </div>
            </section>
          );
        })}

        {/* Footer note */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center">
          <Lock className="h-6 w-6 text-green-600 mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
            Security is an ongoing effort, not a one-time exercise. We continuously review and
            improve our security practices. If you have feedback on this policy or believe we
            can do better, please reach out to us at{" "}
            <a href="mailto:vijayakumartech1@gmail.com" className="text-blue-600 hover:underline">
              vijayakumartech1@gmail.com
            </a>
            .
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-600 mt-4">
            © {new Date().getFullYear()} Nammahut Services Private Limited. All rights reserved. · BillingsEasy
            <br />
            vijayakumartech1@gmail.com · https://billingseasy.com
            <br />
            This policy was last reviewed and updated on July 4, 2026.
          </p>
        </div>
      </div>
    </div>
  );
}
