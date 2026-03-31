import React from "react";
import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="mt-auto shrink-0 bg-surface-low py-6 px-8 flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-outline-variant/20 z-10 w-full">
      <span className="text-[0.6875rem] font-medium text-on-surface-variant uppercase tracking-widest">
        © 2024 Reflector Archive
      </span>
      <div className="flex flex-wrap items-center justify-center gap-6">
        <Link to="/about" className="text-sm text-on-surface-variant hover:text-primary transition-colors">Learn more</Link>
        <Link to="/privacy" className="text-sm text-on-surface-variant hover:text-primary transition-colors">Privacy policy</Link>
      </div>
    </footer>
  );
}
