'use client';

import { useFormStatus } from 'react-dom';

const variants = {
  primary: 'btn-primary',
  accent: 'btn-accent',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
};

export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: keyof typeof variants;
  size?: 'md' | 'lg';
  fullWidth?: boolean;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const classes = ['btn', variants[variant]];
  if (size === 'lg') {
    classes.push('btn-lg');
  }
  if (fullWidth) {
    classes.push('w-full');
  }
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={classes.join(' ')}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
