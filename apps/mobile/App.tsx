import React, { useEffect } from "react";
import { ActivityIndicator, View, Image } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";

import { colors } from "./src/lib/theme";
import { useAuthStore } from "./src/lib/auth-store";
import { LoginScreen } from "./src/screens/LoginScreen";
import { RegisterScreen } from "./src/screens/RegisterScreen";
import { ScanScreen } from "./src/screens/ScanScreen";
import { ResultsScreen } from "./src/screens/ResultsScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const scanIcon = require("./assets/qr-code-scan.png");
const historyIcon = require("./assets/history.png");
const chatIcon = require("./assets/chat.png");
const profileIcon = require("./assets/people.png");

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

function TabIcon({ src, focused }: { src: any; focused: boolean }) {
  return (
    <Image
      source={src}
      style={{
        width: 22,
        height: 22,
        tintColor: focused ? colors.teal : colors.textSecondary,
        opacity: focused ? 1 : 0.7,
      }}
      resizeMode="contain"
    />
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgCard },
        headerTitleStyle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
        headerTintColor: colors.teal,
        tabBarStyle: {
          backgroundColor: colors.bgCard,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 68,
          paddingTop: 8,
          paddingBottom: 12,
        },
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", marginTop: 2 },
      }}
    >
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{
          headerTitle: "FedMRI",
          tabBarIcon: ({ focused }) => <TabIcon src={scanIcon} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Results"
        component={ResultsScreen}
        options={{
          headerTitle: "Scan History",
          tabBarIcon: ({ focused }) => <TabIcon src={historyIcon} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          headerTitle: "Ask AI",
          tabBarIcon: ({ focused }) => <TabIcon src={chatIcon} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          headerTitle: "My Profile",
          tabBarIcon: ({ focused }) => <TabIcon src={profileIcon} focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgBase },
        headerTintColor: colors.teal,
        headerTitle: "",
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const token = useAuthStore((s) => s.token);
  const ready = useAuthStore((s) => s.ready);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => { hydrate(); }, [hydrate]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgBase, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.teal} size="large" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <NavigationContainer theme={navTheme}>
        {token ? <MainTabs /> : <AuthStack />}
      </NavigationContainer>
    </>
  );
}
