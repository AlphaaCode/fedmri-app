import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { ScanLine, ClipboardList, MessageSquare, LifeBuoy } from "lucide-react-native";

import { colors } from "./src/lib/theme";
import { useAuthStore } from "./src/lib/auth-store";
import { LoginScreen } from "./src/screens/LoginScreen";
import { RegisterScreen } from "./src/screens/RegisterScreen";
import { ScanScreen } from "./src/screens/ScanScreen";
import { ResultsScreen } from "./src/screens/ResultsScreen";
import { ResultDetailScreen } from "./src/screens/ResultDetailScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import { SupportScreen } from "./src/screens/SupportScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bgBase,
    card: colors.bgCard,
    text: colors.textPrimary,
    border: colors.border,
    primary: colors.teal,
    notification: colors.coral,
  },
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.bgCard,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 8,
          paddingBottom: 10,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
      }}
    >
      <Tab.Screen name="Scan" component={ScanScreen}
        options={{ tabBarIcon: ({ color, size }) => <ScanLine size={size - 2} color={color} /> }} />
      <Tab.Screen name="Results" component={ResultsScreen}
        options={{ tabBarIcon: ({ color, size }) => <ClipboardList size={size - 2} color={color} /> }} />
      <Tab.Screen name="Chat" component={ChatScreen}
        options={{ tabBarIcon: ({ color, size }) => <MessageSquare size={size - 2} color={color} /> }} />
      <Tab.Screen name="Support" component={SupportScreen}
        options={{ tabBarIcon: ({ color, size }) => <LifeBuoy size={size - 2} color={color} /> }} />
    </Tab.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bgBase } }}>
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="ResultDetail" component={ResultDetailScreen} />
    </Stack.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bgBase } }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const token = useAuthStore((s) => s.token);
  const ready = useAuthStore((s) => s.ready);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => { hydrate(); }, [hydrate]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {!ready ? (
        <View style={{ flex: 1, backgroundColor: colors.bgBase, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      ) : (
        <NavigationContainer theme={navTheme}>
          {token ? <AppStack /> : <AuthStack />}
        </NavigationContainer>
      )}
    </SafeAreaProvider>
  );
}
