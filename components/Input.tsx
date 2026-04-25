import { View, Text, TextInput, TextInputProps } from 'react-native';
import { ReactNode } from 'react';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  icon?: ReactNode;
}

/**
 * 범용 입력 필드 컴포넌트
 */
export function Input({
  label,
  error,
  hint,
  icon,
  className = '',
  ...props
}: InputProps) {
  return (
    <View className="mb-4">
      {label && <Text className="font-semibold text-gray-900 mb-2">{label}</Text>}

      <View
        className={`flex-row items-center border-2 rounded-lg px-4 py-3 ${
          error ? 'border-danger bg-danger/5' : 'border-gray-300 bg-white'
        } ${className}`}
      >
        {icon && <View className="mr-3">{icon}</View>}
        <TextInput
          {...props}
          className="flex-1 text-gray-900"
          placeholderTextColor="#9ca3af"
        />
      </View>

      {error && <Text className="text-danger text-sm mt-2">{error}</Text>}
      {hint && !error && <Text className="text-gray-500 text-sm mt-2">{hint}</Text>}
    </View>
  );
}

export default Input;
