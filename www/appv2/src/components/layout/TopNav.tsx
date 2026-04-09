import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Menu, X } from 'lucide-react';
import { useAuth } from '../../lib/AuthProvider';

interface NavLink {
  label: string;
  href: string;
}

interface TopNavProps {
  links: NavLink[];
}

export const TopNav: React.FC<TopNavProps> = ({ links }) => {
  const location = useLocation();
  const auth = useAuth();
  const user = auth.status === 'authenticated' ? auth.user : null;
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="z-50 bg-surface/85 backdrop-blur-[12px] px-6 md:px-8 py-4 flex items-center justify-between border-b border-outline-variant/10 shrink-0 relative">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2">
          <button 
            className="md:hidden mr-1 text-muted hover:text-primary transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <img src="https://reflector.monadical.com/reach.svg" alt="Reflector Logo" className="w-6 h-6" />
          <span className="font-serif font-bold text-xl text-on-surface">Reflector</span>
        </div>
        <nav className="hidden md:flex items-center gap-6">
          {links.map((link, index) => {
            const isActive = location.pathname === link.href || (link.href !== '/' && location.pathname.startsWith(`${link.href}/`));
            return (
              <React.Fragment key={link.href}>
                <Link
                  to={link.href}
                  className={`font-sans text-sm transition-colors ${
                    isActive ? 'text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {link.label}
                </Link>
                {index < links.length - 1 && (
                  <span className="text-outline-variant/60">·</span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-5">
        <button className="text-muted hover:text-primary transition-colors"><Bell className="w-5 h-5" /></button>
        <div className="relative" ref={dropdownRef}>
          <div 
            className="w-8 h-8 rounded-full bg-surface-high flex items-center justify-center overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all select-none"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            {user?.name ? (
              <span className="font-serif font-bold text-primary">{user.name.charAt(0)}</span>
            ) : (
              <span className="font-serif font-bold text-primary">C</span>
            )}
          </div>
          
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-[0_4px_24px_rgba(27,28,20,0.1)] border border-outline-variant/10 py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="px-4 py-3 border-b border-outline-variant/10 mb-1">
                <p className="text-sm font-semibold text-on-surface truncate">{user?.name || 'Curator'}</p>
                <p className="text-xs text-muted truncate mt-0.5">{user?.email || 'admin@reflector.com'}</p>
              </div>
              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  auth.signOut();
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors font-medium flex items-center gap-2"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="absolute top-[100%] left-0 w-full bg-surface border-b border-outline-variant/10 flex flex-col px-6 py-2 md:hidden shadow-lg z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {links.map((link) => {
            const isActive = location.pathname === link.href || (link.href !== '/' && location.pathname.startsWith(`${link.href}/`));
            return (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`py-3.5 font-sans text-[0.9375rem] transition-colors ${
                  isActive ? 'text-primary font-bold' : 'text-on-surface hover:text-primary'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
};
