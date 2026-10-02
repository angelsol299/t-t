import { ArrowRight, History } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '@/components/TopBar';
import { CHANNEL_NAME, SERVER_URL } from '@/config';
import { registry } from '@/services/registry';
import { useAppDispatch, useAppSelector } from '@/store';
import { setName } from '@/store/slices/session';
import { colors, fonts, radii, tracking, type } from '@/theme/tokens';

/** 01: a name and a live preview of how others see you. */
export default function Join() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const saved = useAppSelector((state) => state.session.name);
  const live = useAppSelector((state) => state.connection.online);
  const dispatch = useAppDispatch();
  const [name, setValue] = useState(edit ? (saved ?? '') : '');
  const [online, setOnline] = useState<number | null>(edit ? live : null);
  const trimmed = name.trim();

  useEffect(() => {
    if (edit) return;
    fetch(`${SERVER_URL}/health`)
      .then((response) => response.json())
      .then((body: { online?: number }) => setOnline(body.online ?? null))
      .catch(() => {});
  }, [edit]);

  const submit = () => {
    if (!trimmed) return;
    dispatch(setName(trimmed));
    if (edit) {
      registry.controller?.reconnect();
      router.back();
    } else {
      router.replace('/channel');
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TopBar right={CHANNEL_NAME} />
        <View style={styles.body}>
          <Text style={[type.headline, { color: colors.ink }]} accessibilityRole="header">
            What should the team call you?
          </Text>
          <View style={styles.field}>
            <Text style={styles.label}>NAME</Text>
            <TextInput
              value={name}
              onChangeText={setValue}
              autoFocus
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={24}
              returnKeyType="go"
              onSubmitEditing={submit}
              placeholder="Your name"
              placeholderTextColor={colors.n400}
              selectionColor={colors.accent}
              cursorColor={colors.accent}
              accessibilityLabel="Your name"
              style={styles.input}
            />
          </View>
          <View style={styles.preview} accessible accessibilityLabel={`Preview: ${trimmed || 'Your name'} is talking`}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(trimmed[0] ?? '?').toUpperCase()}</Text>
            </View>
            <View style={styles.previewText}>
              <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1}>
                {trimmed || 'Your name'} is talking…
              </Text>
              <Text style={[type.meta, { color: colors.n700 }]}>This is how others see you</Text>
            </View>
          </View>
          <View style={styles.spacer} />
          <View style={styles.foot}>
            <History size={16} color={colors.n700} strokeWidth={2} />
            <Text style={[type.meta, { color: colors.n700 }]}>Talk is recorded and kept for 30 days.</Text>
          </View>
        </View>
        <Pressable
          onPress={submit}
          disabled={!trimmed}
          accessibilityRole="button"
          accessibilityLabel={edit ? 'Save name' : `Join ${CHANNEL_NAME}`}
          accessibilityState={{ disabled: !trimmed }}
          style={({ pressed }) => [styles.cta, (!trimmed || pressed) && { opacity: trimmed ? 0.9 : 0.4 }]}
        >
          <Text style={[type.cta, { color: colors.ground }]}>{edit ? 'Save name' : `Join ${CHANNEL_NAME}`}</Text>
          <View style={styles.ctaRight}>
            {online !== null && <Text style={styles.ctaOnline}>{online} online</Text>}
            <ArrowRight size={20} color={colors.ground} strokeWidth={2} />
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { flex: 1, paddingTop: 40, paddingHorizontal: 20, paddingBottom: 24, gap: 24 },
  field: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: radii.field,
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 16,
    gap: 4,
  },
  label: { fontFamily: fonts.w700, fontSize: 11, letterSpacing: tracking(0.14, 11), color: colors.n700 },
  input: { ...type.input, color: colors.ink, padding: 0, lineHeight: 33 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.w700, fontSize: 15, color: colors.ground },
  previewText: { flex: 1, gap: 2 },
  spacer: { flex: 1 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cta: {
    height: 80,
    borderRadius: radii.phone,
    marginHorizontal: 10,
    marginBottom: 10,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  ctaRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ctaOnline: { fontFamily: fonts.w500, fontSize: 14, color: colors.ground, opacity: 0.7 },
});
