import React, { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import WherebyWebinarEmbed from "../components/WherebyWebinarEmbed";
import useRoomDefaultMeeting from "../hooks/rooms/useRoomDefaultMeeting";
import { CheckCircle2, Globe2 } from "lucide-react";

type FormData = {
  name: string;
  email: string;
  company: string;
  role: string;
};

const FORM_ID = "1hhtO6x9XacRwSZS-HRBLN9Ca_7iGZVpNX3_EC4I1uzc";
const FORM_FIELDS = {
  name: "entry.1500809875",
  email: "entry.1359095250",
  company: "entry.1851914159",
  role: "entry.1022377935",
};

export type Webinar = {
  title: string;
  startsAt: string;
  endsAt: string;
};

enum WebinarStatus {
  Upcoming = "upcoming",
  Live = "live",
  Ended = "ended",
}

const ROOM_NAME = "webinar";

// Mock database config from legacy V1
const WEBINARS: Webinar[] = [
  {
    title: "ai-operational-assistant",
    startsAt: "2025-02-05T17:00:00Z",
    endsAt: "2025-02-05T18:00:00Z",
  },
  {
    title: "ai-operational-assistant-dry-run",
    startsAt: "2025-02-05T02:30:00Z",
    endsAt: "2025-02-05T03:10:00Z",
  },
];

export default function WebinarLandingPage() {
  const { title } = useParams<{ title: string }>();
  
  const webinar = WEBINARS.find((w) => w.title === title);
  
  const meeting = useRoomDefaultMeeting(ROOM_NAME);
  const roomUrl = meeting?.response?.host_room_url || meeting?.response?.room_url;

  const [status, setStatus] = useState<WebinarStatus>(WebinarStatus.Ended);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormData>({ name: "", email: "", company: "", role: "" });

  useEffect(() => {
    if (!webinar) return;
    const startDate = new Date(Date.parse(webinar.startsAt));
    const endDate = new Date(Date.parse(webinar.endsAt));

    const updateCountdown = () => {
      const now = new Date();
      if (now < startDate) {
        setStatus(WebinarStatus.Upcoming);
        const difference = startDate.getTime() - now.getTime();
        setCountdown({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      } else if (now < endDate) {
        setStatus(WebinarStatus.Live);
      } else {
        setStatus(WebinarStatus.Ended);
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [webinar]);

  if (!webinar) return <Navigate to="/welcome" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const submitUrl = `https://docs.google.com/forms/d/${FORM_ID}/formResponse`;
      const data = Object.entries(FORM_FIELDS).map(([key, value]) => {
        return `${value}=${encodeURIComponent(formData[key as keyof FormData])}`;
      }).join("&");

      await fetch(submitUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: data,
      });

      setFormSubmitted(true);
    } catch (error) {
      console.error("Error submitting form:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLeave = () => {
    window.location.reload();
  };

  // ──── Live View Render ─────────────────────────────────────────────
  if (status === WebinarStatus.Live) {
    return (
      <div className="w-full h-screen bg-surface">
        {roomUrl ? (
          <WherebyWebinarEmbed roomUrl={roomUrl} onLeave={handleLeave} />
        ) : (
          <div className="flex h-full items-center justify-center text-muted font-medium">Preparing webinar stream...</div>
        )}
      </div>
    );
  }

  // ──── Ended OR Upcoming View Render ─────────────────────────────────────────────
  const isEnded = status === WebinarStatus.Ended;
  const badgeText = isEnded ? "FREE RECORDING" : "FREE WEBINAR";
  const dateText = new Date(Date.parse(webinar.startsAt)).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  });

  return (
    <div className="min-h-screen bg-surface-low py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto bg-surface rounded-3xl shadow-xl overflow-hidden border border-outline-variant/20">
        
        {/* Banner Headers */}
        <div className="px-6 py-12 md:px-20 lg:px-32 text-center">
          <div className="flex justify-center mb-8">
            <Globe2 className="w-12 h-12 text-primary" />
          </div>
          
          <div className="inline-block bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase px-3 py-1 rounded-full mb-6">
            {badgeText}
          </div>

          <h1 className="text-4xl md:text-5xl font-serif font-bold text-on-surface leading-tight mb-4">
            Building AI-Powered<br className="hidden md:block" /> Operational Assistants
          </h1>
          <p className="text-lg text-muted mb-8">From Simple Automation to Strategic Implementation</p>

          {!isEnded && (
            <>
              <p className="font-semibold text-on-surface mb-6">{dateText}</p>
              <div className="flex justify-center gap-4 mb-12">
                {[
                  { value: countdown.days, label: "DAYS" },
                  { value: countdown.hours, label: "HOURS" },
                  { value: countdown.minutes, label: "MIN" },
                  { value: countdown.seconds, label: "SEC" },
                ].map((item, idx) => (
                  <div key={idx} className="bg-surface-high border border-outline-variant/30 shadow-sm rounded-xl p-4 w-20 md:w-24">
                    <div className="text-3xl md:text-4xl font-bold font-mono text-on-surface mb-1">{item.value.toString().padStart(2, '0')}</div>
                    <div className="text-[10px] md:text-xs font-bold text-primary tracking-wider">{item.label}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {isEnded && (
            <div className="relative aspect-video rounded-xl overflow-hidden shadow-lg border border-outline-variant/10 mb-12 bg-surface-high flex items-center justify-center group cursor-pointer" onClick={() => document.getElementById('register-form')?.scrollIntoView({ behavior: 'smooth'})}>
               {/* Note: Replacing dummy next/image with straight img/div */}
               <img src="/webinar-preview.png" alt="Video Preview" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90" onError={(e) => (e.currentTarget.style.display = 'none')} />
               <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                  <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-white shadow-lg">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
               </div>
            </div>
          )}

          <button
            onClick={() => document.getElementById('register-form')?.scrollIntoView({ behavior: "smooth" })}
            className="w-full max-w-sm mx-auto py-4 px-8 bg-primary hover:bg-primary-hover active:bg-primary-active text-on-primary font-bold tracking-wide rounded-full shadow-lg hover:shadow-xl transition-all uppercase"
          >
            {isEnded ? "Get Instant Access" : "RSVP Here"}
          </button>
        </div>

        <hr className="border-outline-variant/10" />

        {/* Informational Content Grid */}
        <div className="px-6 py-16 md:px-20 lg:px-32 bg-surface text-on-surface text-lg leading-relaxed space-y-12">
          
          <div className="space-y-6">
            <p>
              {isEnded 
                ? "The hype around AI agents might be a little premature. But operational assistants are very real, available today, and can unlock your team to do their best work."
                : "AI is ready to deliver value to your organization, but it's not ready to act autonomously. The highest-value applications of AI today are assistants, which significantly increase the efficiency of workers in operational roles."}
            </p>
            <p>
              In this session, we dive into what operational assistants are and how you can implement them in your organization to deliver real, tangible value.
            </p>
          </div>

          <div>
            <h2 className="font-serif text-2xl font-bold mb-6">What We Cover:</h2>
            <ul className="space-y-4">
              {[
                "What an AI operational assistant is (and isn't).",
                "Example use cases for how they can be implemented across your organization.",
                "Key security and design considerations to avoid sharing sensitive data with outside platforms.",
                "Live demos showing both entry-level and advanced implementations.",
                "How you can start implementing them to immediately unlock value.",
              ].map((item, index) => (
                <li key={index} className="flex gap-3">
                  <CheckCircle2 className="w-6 h-6 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact / Registration Form */}
          <div id="register-form" className="bg-surface-high border border-primary/20 p-8 md:p-10 rounded-2xl shadow-sm mt-12">
            <h2 className="font-serif text-2xl font-bold mb-6 text-center">
              {isEnded ? "To Watch This Recording, Fill Out the Brief Form Below:" : "Register for the Live Webinar Event:"}
            </h2>

            {formSubmitted ? (
               <div className="bg-primary/10 border border-primary/30 p-6 rounded-xl flex items-start gap-4 text-primary font-medium">
                  <CheckCircle2 className="w-8 h-8 shrink-0" />
                  <p>Thanks for signing up! {isEnded ? "Check your email. We'll send you the recording link immediately." : "You're registered. We'll email you a reminder before the broadcast begins."}</p>
               </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 max-w-sm mx-auto">
                <input required type="text" placeholder="Your Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-3 rounded-lg border border-outline-variant/30 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all" />
                <input required type="email" placeholder="Your Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-4 py-3 rounded-lg border border-outline-variant/30 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all" />
                <input required type="text" placeholder="Company Name" value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} className="w-full px-4 py-3 rounded-lg border border-outline-variant/30 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all" />
                <input required type="text" placeholder="Your Role" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} className="w-full px-4 py-3 rounded-lg border border-outline-variant/30 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all" />
                
                <button type="submit" disabled={isSubmitting} className="w-full mt-4 py-4 px-6 bg-primary text-white font-bold rounded-full disabled:opacity-50 hover:bg-primary/90 transition-colors uppercase tracking-widest">
                  {isSubmitting ? "Submitting..." : "Get Instant Access"}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Footer Sponsor Block */}
        <div className="bg-surface-low text-center py-16">
          <p className="text-xs font-bold tracking-widest text-muted uppercase mb-4">POWERED BY</p>
          <div className="flex flex-col items-center justify-center opacity-80 decoration-transparent hover:opacity-100 transition-opacity">
            <h1 className="font-serif text-3xl font-bold mb-1">Reflector</h1>
            <p className="text-sm font-medium text-muted">Capture the signal, not the noise</p>
          </div>
        </div>

      </div>
    </div>
  );
}
