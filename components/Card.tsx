import { View, Text } from 'react-native';

interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * 카드 컴포넌트
 */
export function Card({ title, children, className = '' }: CardProps) {
  return (
    <View className={`bg-white rounded-lg shadow-sm p-4 ${className}`}>
      {title && <Text className="text-lg font-semibold text-gray-900 mb-4">{title}</Text>}
      {children}
    </View>
  );
}

export default Card;
