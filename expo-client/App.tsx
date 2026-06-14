import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { RootStackParamList, TabParamList } from './src/nav/types';
import { useAuth, hydrateAuth, useChat } from './src/lib/store';
import { hydrateSettings } from './src/lib/settings';
import { hydrateHost } from './src/lib/config';
import { connectWS, disconnectWS } from './src/lib/ws';
import { startAutoRefresh, stopAutoRefresh } from './src/lib/refresh';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import FriendsScreen from './src/screens/FriendsScreen';
import ChatsScreen from './src/screens/ChatsScreen';
import ChatRoomScreen from './src/screens/ChatRoomScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function tabIcon(emoji: string) {
  return ({ focused }: { focused: boolean }) => (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.4 }}>{emoji}</Text>
  );
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#000',
        tabBarInactiveTintColor: '#888',
      }}
    >
      <Tab.Screen name="Friends" component={FriendsScreen} options={{ title: '친구', tabBarIcon: tabIcon('👥') }} />
      <Tab.Screen name="Chats" component={ChatsScreen} options={{ title: '채팅', tabBarIcon: tabIcon('💬') }} />
    </Tab.Navigator>
  );
}

const screenOptions = {
  headerStyle: { backgroundColor: '#FEE500' },
  headerTintColor: '#3c1e1e',
  headerTitleStyle: { fontWeight: '700' as const },
};

export default function App() {
  const [booting, setBooting] = useState(true);
  const ready = useAuth((s) => s.ready);
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);

  // 부팅: 저장소에서 인증/설정 복원
  useEffect(() => {
    (async () => {
      await Promise.all([hydrateHost(), hydrateAuth(), hydrateSettings()]);
      setBooting(false);
    })();
  }, []);

  // 인증 상태 변화 → WS 연결/해제 + 자동 리프레시 + 채팅 로드
  useEffect(() => {
    if (token && user) {
      useChat.getState().loadFromStorage(user);
      connectWS(user);
      startAutoRefresh();
    } else {
      stopAutoRefresh();
      disconnectWS();
    }
  }, [token, user]);

  if (booting || !ready) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#3c1e1e" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
    <NavigationContainer>
      <StatusBar style="dark" />
      <Stack.Navigator screenOptions={screenOptions}>
        {token ? (
          <>
            <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
            <Stack.Screen name="ChatRoom" component={ChatRoomScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: '설정' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: '회원가입' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEE500' },
});
