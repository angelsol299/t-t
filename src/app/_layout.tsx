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
import { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { Provider } from 'react-redux';
import { Splash } from '@/components/Splash';
import { useSplashVisible } from '@/hooks/useSplashVisible';
import { createController } from '@/services/controller';
import { registry } from '@/services/registry';
import { store, useAppSelector } from '@/store';
import { selectName } from '@/store/selectors';
import { Design } from '@/theme/Design';

SplashScreen.preventAutoHideAsync().catch(() => {});

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
  const name = useAppSelector(selectName);
  const showSplash = useSplashVisible(fontsLoaded);

  useEffect(() => {
    // Our JS splash is pixel-identical ink, so swapping is invisible.
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  useEffect(() => {
    // The app's engine starts once we know who the user is.
    if (name && !registry.controller) void createController(store).start();
  }, [name]);

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
