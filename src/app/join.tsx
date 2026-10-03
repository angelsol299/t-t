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
import { Design } from '@/theme/Design';

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
          <Text style={[Design.typography.headline, { color: Design.color.ink }]} accessibilityRole="header">
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
              placeholderTextColor={Design.color.neutral400}
              selectionColor={Design.color.accent}
              cursorColor={Design.color.accent}
              accessibilityLabel="Your name"
              style={styles.input}
            />
          </View>
          <View style={styles.preview} accessible accessibilityLabel={`Preview: ${trimmed || 'Your name'} is talking`}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(trimmed[0] ?? '?').toUpperCase()}</Text>
            </View>
            <View style={styles.previewText}>
              <Text style={[Design.typography.bodyStrong, { color: Design.color.ink }]} numberOfLines={1}>
                {trimmed || 'Your name'} is talking…
              </Text>
              <Text style={[Design.typography.meta, { color: Design.color.neutral700 }]}>This is how others see you</Text>
            </View>
          </View>
          <View style={styles.spacer} />
          <View style={styles.foot}>
            <History size={16} color={Design.color.neutral700} strokeWidth={2} />
            <Text style={[Design.typography.meta, { color: Design.color.neutral700 }]}>
              Talk is recorded and kept for 30 days.
            </Text>
          </View>
        </View>
        <Pressable
          onPress={submit}
          disabled={!trimmed}
          accessibilityRole="button"
          accessibilityLabel={edit ? 'Save name' : `Join ${CHANNEL_NAME}`}
          accessibilityState={{ disabled: !trimmed }}
          style={({ pressed }) => [styles.cta, { opacity: !trimmed ? 0.4 : pressed ? 0.9 : 1 }]}
        >
          <Text style={[Design.typography.cta, { color: Design.color.ground }]}>
            {edit ? 'Save name' : `Join ${CHANNEL_NAME}`}
          </Text>
          <View style={styles.ctaRight}>
            {online !== null && <Text style={styles.ctaOnline}>{online} online</Text>}
            <ArrowRight size={20} color={Design.color.ground} strokeWidth={2} />
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Design.color.ground },
  body: {
    flex: 1,
    paddingTop: Design.space.xxxlarge,
    paddingHorizontal: Design.space.large,
    paddingBottom: Design.space.xlarge,
    gap: Design.space.xlarge,
  },
  field: {
    backgroundColor: Design.color.white,
    borderWidth: 2,
    borderColor: Design.color.ink,
    borderRadius: Design.radius.field,
    paddingTop: Design.space.medium,
    paddingHorizontal: Design.space.regular,
    paddingBottom: Design.space.regular,
    gap: Design.space.xsmall,
  },
  label: {
    fontFamily: Design.fontFamily.bold,
    fontSize: Design.fontSize.xxxxsmall,
    letterSpacing: Design.letterSpacing(0.14, Design.fontSize.xxxxsmall),
    color: Design.color.neutral700,
  },
  input: { ...Design.typography.input, color: Design.color.ink, padding: 0, lineHeight: 33 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: Design.space.medium, paddingHorizontal: Design.space.xsmall },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Design.color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: Design.fontFamily.bold, fontSize: Design.fontSize.small, color: Design.color.ground },
  previewText: { flex: 1, gap: Design.space.xxsmall },
  spacer: { flex: 1 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: Design.space.small },
  cta: {
    height: 80,
    borderRadius: Design.radius.phone,
    marginHorizontal: Design.space.small,
    marginBottom: Design.space.small,
    backgroundColor: Design.color.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Design.space.large,
  },
  ctaRight: { flexDirection: 'row', alignItems: 'center', gap: Design.space.medium },
  ctaOnline: { fontFamily: Design.fontFamily.medium, fontSize: Design.fontSize.xsmall, color: Design.color.ground, opacity: 0.7 },
});
