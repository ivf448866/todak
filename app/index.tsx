import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  return (
    <View style={{ flex: 1, backgroundColor: '#faf8f5', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color="#3d2c1e" />
    </View>
  );
}
