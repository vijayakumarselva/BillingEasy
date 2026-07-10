import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Mail, Phone, MapPin, Clock, MessageSquare,
  ArrowLeft, Send, Building2, Shield, FileText,
} from "lucide-react";

export default function Contact() {
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [sending, setSending] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      toast.error("Name, email and message are required");
      return;
    }
    setSending(true);
    // Send via mailto as fallback (no backend email yet)
    const body = encodeURIComponent(
      `Name: ${form.name}\nEmail: ${form.email}\nPhone: ${form.phone}\nSubject: ${form.subject}\n\nMessage:\n${form.message}`
    );
    window.location.href = `mailto:vijayakumartech1@gmail.com?subject=${encodeURIComponent("BillingsEasy Contact: " + form.subject)}&body=${body}`;
    toast.success("Opening your email client — send the pre-filled email to reach us.");
    setSending(false);
  };

  const contacts = [
    {
      icon: Mail, label: "Email", value: "vijayakumartech1@gmail.com",
      href: "mailto:vijayakumartech1@gmail.com",
      note: "We respond within 24 hours on business days",
      color: "text-blue-600 bg-blue-50 dark:bg-blue-500/10",
    },
    {
      icon: MessageSquare, label: "Support", value: "support@billingseasy.com",
      href: "mailto:support@billingseasy.com",
      note: "For billing, technical and account queries",
      color: "text-violet-600 bg-violet-50 dark:bg-violet-500/10",
    },
    {
      icon: Clock, label: "Business Hours", value: "Mon – Sat, 9 AM – 6 PM IST",
      note: "We are closed on national holidays",
      color: "text-amber-600 bg-amber-50 dark:bg-amber-500/10",
    },
    {
      icon: MapPin, label: "Registered Address", value: "Tamil Nadu, India",
      note: "Nammahut Services Private Limited",
      color: "text-green-600 bg-green-50 dark:bg-green-500/10",
    },
  ];

  const topics = [
    { icon: Building2, label: "Billing & Payments", email: "billing@billingseasy.com" },
    { icon: Shield, label: "Privacy & Data Requests", email: "privacy@billingseasy.com" },
    { icon: FileText, label: "Legal & Compliance", email: "legal@billingseasy.com" },
    { icon: MessageSquare, label: "General Support", email: "support@billingseasy.com" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <button onClick={() => nav("/")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Home
          </button>
          <span className="font-semibold text-blue-600" style={{ fontFamily: "Outfit, sans-serif" }}>
            Billings<span className="text-slate-800 dark:text-white">Easy</span>
          </span>
          <Button size="sm" onClick={() => nav("/register")} className="bg-blue-600 hover:bg-blue-700 text-white">
            Get started free
          </Button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-12">

        {/* Header */}
        <div className="text-center space-y-3">
          <Badge variant="secondary" className="text-blue-700 bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300">
            Contact Us
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight">We're here to help</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Have a question about BillingsEasy? Reach out and we'll get back to you within one business day.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-10">

          {/* Contact Info */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Get in touch</h2>
            <div className="space-y-4">
              {contacts.map(c => (
                <div key={c.label} className="flex items-start gap-4 p-4 rounded-xl border bg-card">
                  <div className={`p-2.5 rounded-lg ${c.color} shrink-0`}>
                    <c.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{c.label}</p>
                    {c.href ? (
                      <a href={c.href} className="font-semibold text-blue-600 hover:underline">{c.value}</a>
                    ) : (
                      <p className="font-semibold">{c.value}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">{c.note}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Topic-specific emails */}
            <div className="rounded-xl border p-5 space-y-3">
              <h3 className="font-semibold text-sm">Contact by topic</h3>
              <div className="space-y-2">
                {topics.map(t => (
                  <div key={t.label} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2.5 text-sm">
                      <t.icon className="h-4 w-4 text-muted-foreground" />
                      <span>{t.label}</span>
                    </div>
                    <a href={`mailto:${t.email}`} className="text-xs text-blue-600 hover:underline font-mono">{t.email}</a>
                  </div>
                ))}
              </div>
            </div>

            {/* Grievance Officer box (required by IT Rules 2011) */}
            <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-5 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300">
                <Shield className="h-4 w-4" /> Grievance Officer
              </div>
              <p className="text-sm text-amber-700/80 dark:text-amber-300/80">
                As required under the IT (Intermediary Guidelines) Rules, 2021 and DPDP Act 2023:
              </p>
              <div className="text-sm space-y-1">
                <p><strong>Name:</strong> Vijay Kumar</p>
                <p><strong>Email:</strong>{" "}
                  <a href="mailto:vijayakumartech1@gmail.com" className="text-blue-600 hover:underline">
                    vijayakumartech1@gmail.com
                  </a>
                </p>
                <p className="text-xs text-muted-foreground">Grievances will be acknowledged within 24 hours and resolved within 30 days.</p>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="text-xl font-semibold">Send us a message</h2>
                <p className="text-sm text-muted-foreground">Fill in the form and we'll reply to your email.</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Full Name *</Label>
                      <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Vijay Kumar" required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Phone</Label>
                      <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+91 98765 43210" type="tel" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email Address *</Label>
                    <Input value={form.email} onChange={e => set("email", e.target.value)} placeholder="you@company.com" type="email" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Subject</Label>
                    <Input value={form.subject} onChange={e => set("subject", e.target.value)} placeholder="e.g. Issue with GST report export" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Message *</Label>
                    <Textarea value={form.message} onChange={e => set("message", e.target.value)}
                      placeholder="Describe your issue or question in detail..." rows={5} required />
                  </div>
                  <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2" disabled={sending}>
                    <Send className="h-4 w-4" />
                    {sending ? "Opening email…" : "Send Message"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    By submitting, you agree to our{" "}
                    <Link to="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>
                    {" "}and{" "}
                    <Link to="/terms" className="text-blue-600 hover:underline">Terms of Service</Link>.
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quick links */}
        <div className="border-t pt-8">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Legal & Policy Pages</h3>
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Privacy Policy", to: "/privacy" },
              { label: "Terms & Conditions", to: "/terms" },
              { label: "Refund & Cancellation", to: "/refund" },
              { label: "Security Policy", to: "/security" },
            ].map(l => (
              <Link key={l.to} to={l.to}
                className="text-sm text-blue-600 hover:underline border border-blue-200 rounded-lg px-4 py-2 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/30">
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground pb-6">
          © {new Date().getFullYear()} Nammahut Services Private Limited. All rights reserved. · BillingsEasy · Tamil Nadu, India
        </p>
      </div>
    </div>
  );
}
