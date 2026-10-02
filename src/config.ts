import { Platform } from 'react-native';

// The app reaches the server through Toxiproxy (:4000) so the simulator can
// degrade the link. Android emulators see the host machine as 10.0.2.2.
const fallback = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';

export const SERVER_URL = (process.env.EXPO_PUBLIC_SERVER_URL || fallback).replace(/\/$/, '');
export const WS_URL = `${SERVER_URL.replace(/^http/, 'ws')}/ws`;
export const RECEPTION_PHONE = process.env.EXPO_PUBLIC_RECEPTION_PHONE || '+4512345678';
export const CHANNEL_NAME = 'Floor 1';
