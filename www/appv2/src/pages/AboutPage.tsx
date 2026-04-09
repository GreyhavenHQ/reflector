import React from "react";
import { Info } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-surface py-12 px-6">
      <div className="max-w-3xl mx-auto bg-surface-low rounded-2xl p-8 md:p-12 shadow-sm border border-outline-variant/20">
        <div className="flex items-center gap-3 mb-8">
          <Info className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-serif font-bold text-on-surface">About Us</h1>
        </div>

        <div className="space-y-8 text-on-surface-variant leading-relaxed">
          <p className="text-lg">
            <strong>Reflector</strong> is a transcription and summarization pipeline that transforms audio into knowledge. The output is meeting minutes and topic summaries enabling topic-specific analyses stored in your systems of record. This is accomplished on your infrastructure – without 3rd parties – keeping your data private, secure, and organized.
          </p>

          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-bold text-on-surface border-b border-outline-variant/10 pb-2">FAQs</h2>
            
            <div className="mt-6">
              <h3 className="text-lg font-bold text-on-surface mb-2">1. How does it work?</h3>
              <p>Reflector simplifies tasks, turning spoken words into organized information. Just press "record" to start and "stop" to finish. You'll get notes divided by topic, a meeting summary, and the option to download recordings.</p>
            </div>

            <div className="mt-6">
              <h3 className="text-lg font-bold text-on-surface mb-2">2. What makes Reflector different?</h3>
              <p>Monadical prioritizes safeguarding your data. Reflector operates exclusively on your infrastructure, ensuring guaranteed security.</p>
            </div>

            <div className="mt-6">
              <h3 className="text-lg font-bold text-on-surface mb-2">3. Are there any industry-specific use cases?</h3>
              <p className="mb-2">Absolutely! We have two custom deployments pre-built:</p>
              <ul className="list-disc pl-6 space-y-2 text-on-surface-variant">
                <li><strong>Reflector Media:</strong> Ideal for meetings, providing real-time notes and topic summaries.</li>
                <li><strong>Projector Reflector:</strong> Suited for larger events, offering live topic summaries, translations, and agenda tracking.</li>
              </ul>
            </div>

            <div className="mt-6">
              <h3 className="text-lg font-bold text-on-surface mb-2">4. Who’s behind Reflector?</h3>
              <p>Monadical is a cohesive and effective team that can connect seamlessly into your workflows, and we are ready to integrate Reflector’s building blocks into your custom tools. We’re committed to building software that outlasts us 🐙.</p>
            </div>
          </section>

          <footer className="pt-8 mt-12 border-t border-outline-variant/10 text-center">
            <p className="text-on-surface font-medium">
              Contact us at <a href="mailto:hello@monadical.com" className="text-primary hover:text-primary-active underline underline-offset-4 decoration-primary/30">hello@monadical.com</a>
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
