import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthProvider";
import { ArrowRight, Fingerprint, Sparkles, LogIn } from "lucide-react";

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", { email, password });

    setLoading(false);

    if (result.ok) {
      navigate("/welcome");
    } else {
      setError(result.error || "Invalid email or password");
    }
  };

  const handleSSOLogin = () => {
    signIn("sso");
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col font-sans text-on-surface selection:bg-primary-fixed">
      {/* Top Navigation */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4 bg-surface/85 backdrop-blur-[12px]">
        <div className="flex items-center gap-3">
          <img
            src="https://reflector.monadical.com/reach.svg"
            alt="Reflector Logo"
            className="w-6 h-6"
          />
          <span className="text-2xl font-bold text-on-surface tracking-tight font-serif">
            Reflector
          </span>
        </div>
        <div className="flex items-center gap-8">
          <nav className="hidden md:flex items-center gap-6">
            <a
              href="#"
              className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-300 text-sm"
            >
              Collections
            </a>
            <span className="text-outline-variant/60">·</span>
            <a
              href="#"
              className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-300 text-sm"
            >
              Exhibitions
            </a>
            <span className="text-outline-variant/60">·</span>
            <a
              href="#"
              className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-300 text-sm"
            >
              Journal
            </a>
          </nav>
          <button
            onClick={handleSSOLogin}
            className="bg-gradient-primary text-white px-[18px] py-[6px] rounded-sm text-sm font-semibold hover:brightness-110 active:brightness-95 transition-all"
          >
            Log In
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-24 md:py-0 mt-16 md:mt-0">
        <div className="w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-12 lg:gap-24 items-center">
          {/* Left Column: Marketing Copy */}
          <div className="md:col-span-7 space-y-8">
            <h1 className="text-[2.5rem] text-on-surface leading-[1.1] tracking-tight">
              <span className="font-serif">Welcome to </span>
              <span className="font-serif italic">Reflector</span>
            </h1>

            <p className="text-[0.9375rem] text-on-surface-variant max-w-[420px] leading-[1.6]">
              Access a curated digital environment designed for intellectual
              authority and archival depth. Manage your collections with the
              precision of a modern curator.
            </p>

            <div>
              <button className="flex items-center gap-2 text-primary font-semibold text-sm hover:underline underline-offset-4 transition-all group bg-transparent border-none p-0">
                Learn more
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            <div className="mt-8 pt-8 space-y-4 max-w-[420px]">
              <p className="text-[0.875rem] text-on-surface-variant font-serif italic leading-relaxed">
                "The Digital Curator prioritizes warmth, intentionality, and
                authority in every interaction."
              </p>
              <a
                href="#"
                className="inline-block text-[0.6875rem] uppercase tracking-widest font-semibold text-on-surface-variant hover:text-primary transition-colors"
              >
                Privacy policy
              </a>
            </div>
          </div>

          {/* Right Column: Login Card */}
          <div className="md:col-span-5 relative flex justify-center md:justify-end">
            <div className="w-full max-w-md bg-surface-highest rounded-md p-8 shadow-card flex flex-col items-center text-center relative z-10">
              <div className="text-primary mb-6">
                <Fingerprint className="w-6 h-6" strokeWidth={1.5} />
              </div>

              <h2 className="font-serif text-[1.25rem] font-semibold text-on-surface mb-3">
                Secure Access
              </h2>

              <p className="text-sm text-on-surface-variant max-w-[240px] mx-auto mb-6 leading-relaxed">
                Enter the archive to view your curated workspace and historical
                logs.
              </p>

              {/* Error Message */}
              {error && (
                <div className="w-full mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-sm text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Credentials Form */}
              <form
                onSubmit={handleCredentialsLogin}
                className="w-full space-y-3 mb-4"
              >
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 bg-surface-mid border border-outline-variant/30 rounded-sm text-sm text-on-surface placeholder:text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 bg-surface-mid border border-outline-variant/30 rounded-sm text-sm text-on-surface placeholder:text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-primary text-white font-semibold rounded-sm hover:brightness-110 active:brightness-95 transition-all text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      Log In
                    </>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="w-full flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-outline-variant/20" />
                <span className="text-[0.6875rem] text-muted uppercase tracking-wider font-medium">
                  or
                </span>
                <div className="flex-1 h-px bg-outline-variant/20" />
              </div>

              {/* SSO Button */}
              <button
                onClick={handleSSOLogin}
                className="w-full py-2.5 border border-outline-variant/30 text-on-surface-variant font-medium rounded-sm hover:bg-surface-mid hover:border-primary/30 transition-all text-sm"
              >
                Continue with SSO
              </button>

              <p className="mt-6 text-[0.6875rem] text-muted uppercase tracking-widest font-medium">
                Authorized Personnel Only
              </p>
            </div>

            {/* Floating Editorial Detail */}
            <div className="absolute -bottom-4 -left-4 md:-left-8 bg-surface-mid px-2.5 py-1 rounded-sm shadow-sm flex items-center gap-1.5 z-20 border border-outline-variant/20">
              <Sparkles className="w-3 h-3 text-on-surface-variant" />
              <span className="text-[0.6875rem] font-medium text-on-surface-variant uppercase tracking-wider">
                Curated Experience Engine v6.9
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto bg-surface-low py-8 px-8 flex flex-col md:flex-row justify-between items-center gap-4 border-t border-outline-variant/20">
        <span className="text-[0.6875rem] font-medium text-on-surface-variant uppercase tracking-widest">
          © 2024 Reflector Archive
        </span>
        <div className="flex items-center gap-6">
          <a href="#" className="text-sm text-on-surface-variant hover:text-primary transition-colors">Learn more</a>
          <a href="#" className="text-sm text-on-surface-variant hover:text-primary transition-colors">Privacy policy</a>
        </div>
      </footer>
    </div>
  );
}
