import React from 'react';

interface FieldErrorProps {
  message?: string;
}

export const FieldError: React.FC<FieldErrorProps> = ({ message }) => {
  if (!message) return null;
  
  return (
    <span className="font-sans text-[0.8125rem] text-primary mt-1 block">
      {message}
    </span>
  );
};
