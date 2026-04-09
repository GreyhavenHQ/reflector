import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={`bg-surface-mid border border-outline-variant/40 rounded-sm px-3.5 py-2.5 font-sans text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition-all appearance-none ${className}`}
        {...props}
      >
        {children}
      </select>
    );
  }
);

Select.displayName = 'Select';
