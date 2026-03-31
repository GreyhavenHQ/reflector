import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`bg-surface-mid border border-outline-variant/40 rounded-sm px-3.5 py-2.5 font-sans text-on-surface placeholder:text-muted focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition-all ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
