import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

const sections = [
  {
    id: "credit-packs",
    title: "1. Credit Pack Purchases — General Policy",
    icon: null,
    type: "default",
    content: `All credit pack purchases on BillingEasy are final. Due to the nature of digital goods and the immediate delivery of credits to your account upon successful payment, we operate a strict no-refund policy for credit pack purchases in general.

When you purchase a credit pack:
• Credits are immediately and automatically credited to your BillingEasy account upon successful payment confirmation from our payment gateway (Cashfree Payments).
• A GST-compliant tax invoice is generated and made available for download from your account dashboard.
• The transaction is considered complete and delivered at the moment credits are added to your account.

This policy is in accordance with the nature of digital goods and services and is consistent with the Consumer Protection (E-Commerce) Rules, 2020 and general principles of the Consumer Protection Act, 2019 applicable to digital service purchases.

We strongly recommend that you review available credit pack options carefully before making a purchase. If you have any questions about which credit pack is right for your usage, please contact us at vijayakumartech1@gmail.com before completing your purchase.`,
  },
  {
    id: "technical-failure",
    title: "2. Exception — Technical Failure (Payment Debited, Credits Not Added)",
    icon: CheckCircle,
    type: "success",
    content: `We recognise that technical failures can occasionally occur during payment processing. If your bank account or credit/debit card has been debited but the corresponding credits have NOT appeared in your BillingEasy account within 30 minutes of the transaction, you are entitled to a full refund of the debited amount.

Eligibility conditions for this exception:
• Your bank account, UPI handle, or card has been charged/debited.
• The credits have not been added to your BillingEasy wallet/account.
• This has not been resolved automatically within 30 minutes of the transaction timestamp.
• You raise a refund request within 7 (seven) calendar days of the transaction date.

What we will do:
Upon verification of your claim — which includes checking payment gateway logs, transaction records, and your account credit history — we will process a full refund of the debited amount to your original payment method.

Refund timeline for technical failures: 5 to 7 business days from the date of approval of your refund request, subject to your bank's or payment network's processing timelines.

Please note: In some cases, a technical delay may resolve itself (i.e., credits appear after a short delay). We will first verify whether the credits were eventually credited before processing a refund. If credits were credited with a delay, a refund will not be issued, but we may issue goodwill credits at our discretion.`,
  },
  {
    id: "duplicate-payment",
    title: "3. Exception — Duplicate Payment (Accidental Double Charge)",
    icon: CheckCircle,
    type: "success",
    content: `If you have been charged twice for the same credit pack purchase due to a technical error — for example, a network timeout causing a transaction to be submitted twice, or a double-click on the payment button resulting in two successful debits — you are entitled to a full refund of the duplicate charge.

Eligibility conditions for this exception:
• You have been charged more than once for the same intended transaction.
• The duplicate charge resulted in credits being added twice to your account, or a second charge was processed without corresponding credits.
• You raise a refund request within 7 (seven) calendar days of the duplicate transaction date.

What we will do:
We will cross-reference our payment gateway records (Cashfree) and your account credit logs to verify the duplicate charge. Upon confirmation, we will process a full refund of the duplicate amount to your original payment method.

If the duplicate charge resulted in double credits being added to your account, we will refund the duplicate payment and simultaneously deduct the extra credits from your account. By raising a refund request for a duplicate charge, you consent to this credit adjustment.

Refund timeline for duplicate payments: Within 7 (seven) business days from the date of approval of your refund request.`,
  },
  {
    id: "no-refund",
    title: "4. No Refund Scenarios",
    icon: XCircle,
    type: "danger",
    content: `Refunds will NOT be issued in the following circumstances, regardless of the reason:

(a) Change of Mind: You changed your mind after purchasing a credit pack, decided you no longer need the Service, or found an alternative solution.

(b) Unused Credits: You purchased credits but did not use them, either partially or entirely. Unused credits do not qualify for any refund. Credits do not expire and remain in your account for future use.

(c) Partial Use: You used some credits from a credit pack and wish to seek a refund for the remaining unused credits. Refunds are not available for partially consumed credit packs.

(d) Dissatisfaction with AI Output: You are dissatisfied with the quality, accuracy, or usefulness of AI-generated outputs from the AI Bookkeeper or other AI features. AI output quality issues do not constitute grounds for a refund; however, you are welcome to provide feedback for improvement.

(e) Account Suspension or Termination for Policy Violation: If your account is suspended or terminated due to a violation of our Terms of Service, Acceptable Use Policy, or any other policy, no refund will be issued for any unused credits.

(f) Voluntary Account Deletion: If you choose to delete your account, unused credits will be forfeited and no refund will be issued for them.

(g) Incorrect Credit Pack Purchased: If you purchased a credit pack of a denomination different from what you intended (for example, you bought a larger pack than needed), this does not constitute a refund-eligible scenario. Please contact us before purchasing if you are unsure.

(h) Requests Beyond the 7-Day Window: Refund requests raised more than 7 (seven) calendar days after the date of the transaction (or the date of discovering an eligible issue) will not be entertained.`,
  },
  {
    id: "how-to-request",
    title: "5. How to Request a Refund",
    icon: null,
    type: "default",
    content: `If you believe your situation falls under one of the eligible refund exceptions (Technical Failure or Duplicate Payment), please follow these steps to initiate a refund request:

Step 1 — Contact Us by Email:
Send an email to vijayakumartech1@gmail.com with the subject line: "Refund Request — [Your Transaction ID]"

Step 2 — Include the Following Information in Your Email:
• Your full name as registered on BillingEasy
• Your registered email address
• The Transaction ID / Order ID (available in your bank statement, UPI app, or Cashfree payment confirmation email)
• The date and time of the transaction
• The amount debited
• A clear description of the issue (Technical Failure or Duplicate Payment)
• Screenshots or documents supporting your claim (e.g., bank statement showing debit, payment confirmation, screenshot of your BillingEasy wallet showing credits not added)

Step 3 — Deadline:
Your refund request must be submitted within 7 (seven) calendar days of the date of the transaction or the date you discovered the eligible issue, whichever is earlier. Requests received after this period will not be processed.

Step 4 — Await Acknowledgement:
We will acknowledge your refund request within 24 hours of receipt (on business days). If your request is received on a weekend or public holiday, acknowledgement will be provided on the next business day.`,
  },
  {
    id: "refund-process",
    title: "6. Refund Process & Timeline",
    icon: RefreshCw,
    type: "info",
    content: `Once a valid refund request is received, the following process will be followed:

(a) Acknowledgement: We will acknowledge receipt of your refund request within 24 (twenty-four) hours on business days (Monday to Saturday, excluding public holidays in Tamil Nadu).

(b) Verification: Our team will verify your claim by reviewing payment gateway records (Cashfree), your account credit history, and any supporting documentation you provide. This verification typically takes 1 to 3 business days.

(c) Decision Communication: We will communicate our decision on your refund request — approval or rejection with reasons — via email to your registered email address.

(d) Refund Processing: If your refund is approved, we will initiate the refund within 5 to 7 (five to seven) business days from the date of approval.

(e) Refund to Original Payment Method: All refunds will be processed to the original payment method used for the transaction. This includes:
   • UPI: Refund to the originating UPI ID/bank account
   • Debit Card / Credit Card: Refund to the originating card (credit card refunds may take additional time to reflect as per your card issuer's policies)
   • Net Banking: Refund to the originating bank account

(f) Bank Processing Time: Please note that once we initiate the refund, the time taken for the amount to reflect in your bank account is governed by your bank or payment network, which is typically 2 to 5 additional business days beyond our processing time. Total timeline from approval to receipt in your bank account: typically 7 to 10 business days.

(g) Non-Refundable GST: Please note that the GST charged on your credit pack purchase (18%) is collected and remitted to the Government of India. In the event of a valid refund, we will endeavour to process a GST refund as per the provisions of the GST Act, 2017 and GSTN procedures. However, the timing and mechanism of GST refunds are subject to applicable regulations.`,
  },
  {
    id: "chargebacks",
    title: "7. Chargebacks",
    icon: AlertTriangle,
    type: "warning",
    content: `A chargeback is a reversal of a payment initiated by your bank or card issuer at your request. Before raising a chargeback with your bank or card issuer, we strongly request that you contact us directly at vijayakumartech1@gmail.com, as most legitimate issues can be resolved quickly and amicably without the need for a chargeback.

Why contact us first?
• Chargebacks can take weeks to resolve through your bank, whereas we typically resolve verified issues within 7 business days.
• A direct resolution is faster and protects your account standing.

Consequences of Wrongful Chargebacks:
If you raise a chargeback for a transaction that does not qualify for a refund under this Policy (for example, a change-of-mind chargeback for fully delivered credits), BillingEasy reserves the right to:
• Immediately suspend or terminate your BillingEasy account;
• Contest the chargeback with the payment network using transaction evidence, including proof of credit delivery to your account;
• Seek recovery of any chargeback-related costs and fees imposed on us by the payment gateway or banks;
• Report fraudulent chargebacks to appropriate authorities where warranted.

Legitimate Chargebacks:
If you have not received a satisfactory resolution from us within the timelines specified in this Policy, and you have a legitimate claim for a refund, you may exercise your right to raise a chargeback with your bank as permitted by RBI guidelines and applicable law. We will cooperate with such legitimate chargeback investigations.`,
  },
  {
    id: "grievance-officer",
    title: "8. Grievance Officer",
    icon: null,
    type: "default",
    content: `In accordance with the Consumer Protection (E-Commerce) Rules, 2020 and the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, BillingEasy has designated a Grievance Officer to address concerns related to refunds, billing, and service quality.

Grievance Officer Details:

Name: Vijay Kumar
Designation: Grievance Officer, BillingEasy
Email: vijayakumartech1@gmail.com
Website: https://billingseasy.com

The Grievance Officer will:
• Acknowledge your complaint within 48 (forty-eight) hours of receipt.
• Endeavour to resolve your complaint within 30 (thirty) days of receipt, as mandated under applicable law.
• Communicate the resolution or status of your complaint via email.

When writing to the Grievance Officer regarding a refund-related grievance, please include:
• Your full name and registered email address
• Your transaction ID and date of transaction
• A detailed description of your grievance
• Any supporting documentation (bank statements, screenshots, etc.)

If you are not satisfied with the resolution provided by the Grievance Officer, you may approach the appropriate Consumer Disputes Redressal Commission under the Consumer Protection Act, 2019 or seek other legal remedies available under Indian law.`,
  },
  {
    id: "governing-law",
    title: "9. Governing Law",
    icon: null,
    type: "default",
    content: `This Refund & Cancellation Policy is governed by and construed in accordance with the laws of India, including but not limited to:

• The Consumer Protection Act, 2019
• The Consumer Protection (E-Commerce) Rules, 2020
• RBI Guidelines on Payment Aggregators and Payment Gateways
• The Information Technology Act, 2000
• The GST Act, 2017

Any dispute arising out of or in connection with this Policy — including any question regarding its existence, validity, or termination — shall be subject to the exclusive jurisdiction of the courts located in Tamil Nadu, India.

For matters involving amounts below the threshold for civil suits, disputes may also be raised before the appropriate Consumer Disputes Redressal Commission (District, State, or National, as applicable based on the value of the dispute) under the Consumer Protection Act, 2019.

Effective Date of this Policy: July 4, 2026
This Policy supersedes all prior refund policies published by BillingEasy.`,
  },
];

const typeStyles = {
  default: "border-gray-200 bg-white",
  success: "border-green-200 bg-green-50/30",
  danger: "border-red-200 bg-red-50/30",
  warning: "border-amber-200 bg-amber-50/30",
  info: "border-blue-200 bg-blue-50/30",
};

const titleStyles = {
  default: "text-gray-900",
  success: "text-green-800",
  danger: "text-red-800",
  warning: "text-amber-800",
  info: "text-blue-800",
};

const contentStyles = {
  default: "text-gray-700",
  success: "text-green-900",
  danger: "text-red-900",
  warning: "text-amber-900",
  info: "text-blue-900",
};

export default function Refund() {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-blue-600" />
            <span className="font-semibold text-gray-900 hidden sm:block">BillingEasy</span>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-col gap-3">
            <Badge variant="outline" className="w-fit text-xs text-gray-500 border-gray-300">
              Last updated: July 4, 2026
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Refund &amp; Cancellation Policy</h1>
            <p className="text-gray-600 text-base max-w-2xl">
              This policy explains our refund and cancellation terms for BillingEasy credit pack purchases, in accordance
              with Indian consumer protection law and RBI guidelines.
            </p>
            <div className="flex flex-wrap gap-2 mt-1">
              {["Consumer Protection Act, 2019", "E-Commerce Rules, 2020", "RBI Guidelines"].map((law) => (
                <Badge key={law} variant="secondary" className="text-xs">
                  {law}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Summary */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">
        <Card className="border border-gray-200 bg-white mb-2">
          <CardHeader className="pb-3 pt-5">
            <CardTitle className="text-sm font-semibold text-gray-700">Quick Summary</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-start gap-2 p-3 bg-green-50 rounded-lg border border-green-100">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-green-800">Eligible for Refund</p>
                  <p className="text-xs text-green-700 mt-0.5">Payment debited, credits not added • Duplicate charge</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-100">
                <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-red-800">Not Eligible</p>
                  <p className="text-xs text-red-700 mt-0.5">Change of mind • Unused credits • Partial use</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <RefreshCw className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-blue-800">Refund Timeline</p>
                  <p className="text-xs text-blue-700 mt-0.5">5–7 business days to original payment method</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table of Contents */}
        <Card className="mb-6 mt-4 border border-blue-100 bg-blue-50/50">
          <CardHeader className="pb-3 pt-5">
            <CardTitle className="text-sm font-semibold text-blue-900">Table of Contents</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="text-sm text-blue-700 hover:text-blue-900 hover:underline py-0.5"
                >
                  {section.title}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sections */}
        <div className="flex flex-col gap-4">
          {sections.map((section) => (
            <Card
              key={section.id}
              id={section.id}
              className={`border shadow-sm scroll-mt-20 ${typeStyles[section.type]}`}
            >
              <CardHeader className="pb-3 pt-5">
                <CardTitle className={`text-lg font-semibold flex items-center gap-2 ${titleStyles[section.type]}`}>
                  {section.icon && <section.icon className="h-5 w-5 flex-shrink-0" />}
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className={`text-sm leading-relaxed whitespace-pre-line ${contentStyles[section.type]}`}>
                  {section.content}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Contact CTA */}
        <div className="mt-8 mb-6 p-5 bg-blue-50 border border-blue-200 rounded-lg flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-sm text-blue-900 font-semibold mb-1">Have a refund query?</p>
            <p className="text-sm text-blue-800">
              Contact us at{" "}
              <a href="mailto:vijayakumartech1@gmail.com" className="font-medium underline hover:no-underline">
                vijayakumartech1@gmail.com
              </a>{" "}
              with your transaction ID within 7 days of the issue. We typically respond within 24 hours.
            </p>
          </div>
          <a
            href="mailto:vijayakumartech1@gmail.com?subject=Refund Request"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            Email Us
          </a>
        </div>

        <div className="text-center text-xs text-gray-400 pb-8">
          © 2026 BillingEasy. All rights reserved. |{" "}
          <a href="mailto:vijayakumartech1@gmail.com" className="hover:text-gray-600 underline">
            vijayakumartech1@gmail.com
          </a>{" "}
          |{" "}
          <a href="https://billingseasy.com" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 underline">
            https://billingseasy.com
          </a>
        </div>
      </div>
    </div>
  );
}
