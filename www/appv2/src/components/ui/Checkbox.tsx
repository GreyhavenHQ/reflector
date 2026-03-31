import React from 'react';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', label, ...props }, ref) => {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          ref={ref}
          className={`appearance-none w-4 h-4 rounded-[4px] border-[1.5px] border-outline-variant/60 checked:bg-primary checked:border-primary transition-colors relative
            checked:after:content-[''] checked:after:absolute checked:after:left-[4px] checked:after:top-[1px] checked:after:w-[5px] checked:after:h-[9px] checked:after:border-r-2 checked:after:border-b-2 checked:after:border-white checked:after:rotate-45
            ${className}`}
          {...props}
        />
        {label && <span className="font-sans text-sm text-on-surface">{label}</span>}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
