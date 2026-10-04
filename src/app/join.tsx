import { JoinButton } from '@/components/join/JoinButton';
import { NameField } from '@/components/join/NameField';
import { RecordedTimeMessage } from '@/components/join/RecordedTimeMessage';
import { Title } from '@/components/join/Title';
import { NamePreview } from '@/components/NamePreview';
import { TopBar } from '@/components/TopBar';
import { CHANNEL_NAME } from '@/config';
import { registry } from '@/services/registry';
import { useAppDispatch, useAppSelector } from '@/store';
import { selectName } from '@/store/selectors';
import { setName } from '@/store/slices/session';
import { Design } from '@/theme/Design';
import { router, useLocalSearchParams } from 'expo-router';

import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
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
          <Title />
          <NameField draft={draft} onChangeText={setDraft} submit={submit} />
          <NamePreview name={name} />
          <View style={styles.spacer} />
          <RecordedTimeMessage />
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
  spacer: { flex: 1 },
});
