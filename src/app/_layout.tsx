import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/archivo';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import { Provider } from 'react-redux';
import { Splash } from '@/components/Splash';
import { createController } from '@/services/controller';
import { registry } from '@/services/registry';
import { store, useAppSelector } from '@/store';
import { Design } from '@/theme/Design';

SplashScreen.preventAutoHideAsync().catch(() => {});

// The splash always shows for at least SPLASH_MIN_MS so the brand moment is
// actually seen (fonts alone load in a few ms). It is held while the channel
// connects, but never longer than SPLASH_MAX_MS: with no signal the app opens
// in its offline state (recording still works).
const SPLASH_MIN_MS = 1200;
const SPLASH_MAX_MS = 2000;

export default function RootLayout() {
  return (
    <Provider store={store}>
      <Root />
    </Provider>
  );
}

function Root() {
  const [fontsLoaded] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
  });
  const name = useAppSelector((state) => state.session.name);
  const connected = useAppSelector((state) => state.connection.everConnected);
  const [minElapsed, setMinElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const min = setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS);
    const max = setTimeout(() => setTimedOut(true), SPLASH_MAX_MS);
    return () => {
      clearTimeout(min);
      clearTimeout(max);
    };
  }, []);

  useEffect(() => {
    // Our JS splash is pixel-identical ink, so swapping is invisible.
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  useEffect(() => {
    if (name && !registry.controller) void createController(store).start();
  }, [name]);

  const showSplash = !fontsLoaded || !minElapsed || (!!name && !connected && !timedOut);

  return (
    <>
      <StatusBar barStyle={showSplash ? 'light-content' : 'dark-content'} />
      {/* Screens mount only once Archivo is registered: on iOS, text first drawn
          before its font loads keeps the system fallback until it re-renders. */}
      {fontsLoaded && (
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Design.color.ground }, animation: 'fade' }}
        />
      )}
      {showSplash && <Splash />}
    </>
  );
}
