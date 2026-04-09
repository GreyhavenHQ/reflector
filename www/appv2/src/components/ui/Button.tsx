import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className = '', children, ...props }, ref) => {
    const baseStyles = 'rounded-sm px-5 py-2.5 font-sans font-semibold text-sm transition-all duration-200';
    
    const variants = {
      primary: 'bg-gradient-primary text-on-primary border-none hover:brightness-110 active:brightness-95',
      secondary: 'bg-transparent border-[1.5px] border-primary text-primary hover:bg-primary/5',
      tertiary: 'bg-transparent border-none text-primary hover:bg-surface-mid',
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
