import { JoinButton } from '@/components/join/JoinButton';
import { NameField } from '@/components/join/NameField';
import { NamePreview } from '@/components/NamePreview';
import { TopBar } from '@/components/TopBar';
import { CHANNEL_NAME } from '@/config';
import { registry } from '@/services/registry';
import { useAppDispatch, useAppSelector } from '@/store';
import { selectName } from '@/store/selectors';
import { setName } from '@/store/slices/session';
import { Design } from '@/theme/Design';
import { router, useLocalSearchParams } from 'expo-router';
import { History } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * 01: a name and a live preview of how others see you.
 * Opened with `?edit=1` (long-press the logo on the channel) to change the name later.
 */
export default function Join() {
  const isEditing = !!useLocalSearchParams<{ edit?: string }>().edit;
  const savedName = useAppSelector(selectName);
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState(isEditing ? (savedName ?? '') : '');

  const name = draft.trim();

  const submit = () => {
    if (!name) return;
    dispatch(setName(name));
    if (isEditing) {
      registry.controller?.reconnect(); // so the server announces the new name
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
          <Text style={styles.title} accessibilityRole="header">
            What should the team call you?
          </Text>
          <NameField draft={draft} onChangeText={setDraft} submit={submit} />
          <NamePreview name={name} />
          <View style={styles.spacer} />
          <View style={styles.foot}>
            <History size={16} color={Design.color.neutral700} strokeWidth={2} />
            <Text style={styles.footText}>Talk is recorded and kept for 30 days.</Text>
          </View>
        </View>
        <JoinButton submit={submit} name={name} isEditing={isEditing} />
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
  title: { ...Design.typography.headline, color: Design.color.ink },
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
  spacer: { flex: 1 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: Design.space.small },
  footText: { ...Design.typography.meta, color: Design.color.neutral700 },
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
  ctaPressed: { opacity: 0.9 },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { ...Design.typography.cta, color: Design.color.ground },
  ctaRight: { flexDirection: 'row', alignItems: 'center', gap: Design.space.medium },
  ctaOnline: { fontFamily: Design.fontFamily.medium, fontSize: Design.fontSize.xsmall, color: Design.color.ground, opacity: 0.7 },
});
