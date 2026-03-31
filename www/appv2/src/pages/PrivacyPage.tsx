import React from "react";
import { ShieldAlert } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface py-12 px-6">
      <div className="max-w-3xl mx-auto bg-surface-low rounded-2xl p-8 md:p-12 shadow-sm border border-outline-variant/20">
        <div className="flex items-center gap-3 mb-2">
          <ShieldAlert className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-serif font-bold text-on-surface">Privacy Policy</h1>
        </div>
        <p className="text-sm font-medium text-muted mb-8 italic">Last updated on September 22, 2023</p>

        <div className="space-y-6 text-on-surface-variant leading-relaxed">
          <ul className="space-y-6">
            <li className="flex flex-col">
              <strong className="text-lg text-on-surface mb-1">Recording Consent</strong>
              <p>By using Reflector, you grant us permission to record your interactions for the purpose of showcasing Reflector's capabilities during the All In AI conference.</p>
            </li>
            
            <li className="flex flex-col">
              <strong className="text-lg text-on-surface mb-1">Data Access</strong>
              <p>You will have convenient access to your recorded sessions and transcriptions via a unique URL, which remains active for a period of seven days. After this time, your recordings and transcripts will be permanently deleted.</p>
            </li>

            <li className="flex flex-col">
              <strong className="text-lg text-on-surface mb-1">Data Confidentiality</strong>
              <p>Rest assured that none of your audio data will be shared with third parties.</p>
            </li>
          </ul>

          <footer className="pt-8 mt-12 border-t border-outline-variant/10 text-center">
            <p className="text-on-surface font-medium">
              Questions or Concerns: If you have any questions or concerns regarding your data, please feel free to reach out to us at{" "}
              <a href="mailto:reflector@monadical.com" className="text-primary hover:text-primary-active underline underline-offset-4 decoration-primary/30">
                reflector@monadical.com
              </a>
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
