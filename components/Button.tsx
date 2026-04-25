import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ReactNode } from 'react';

interface ButtonProps {
  onPress: () => void;
  title: string;
  variant?: 'primary' | 'secondary' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  children?: ReactNode;
  className?: string;
}

/**
 * 범용 버튼 컴포넌트
 */
export function Button({
  onPress,
  title,
  variant = 'primary',
  disabled = false,
  loading = false,
  className = '',
}: ButtonProps) {
  const baseClass = 'rounded-lg px-6 py-3 flex-row items-center justify-center';

  const variantClass = {
    primary: 'bg-primary',
    secondary: 'bg-secondary',
    outline: 'border-2 border-primary',
  }[variant];

  const textClass = {
    primary: 'text-white',
    secondary: 'text-white',
    outline: 'text-primary',
  }[variant];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      className={`${baseClass} ${variantClass} ${disabled ? 'opacity-50' : ''} ${className}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? '#6366f1' : 'white'} />
      ) : (
        <Text className={`font-semibold ${textClass}`}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

export default Button;
