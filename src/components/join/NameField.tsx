import { Design } from '@/theme/Design';
import { Dispatch, SetStateAction } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

interface NameFieldProps {
  draft: string;
  onChangeText: Dispatch<SetStateAction<string>>;
  submit: () => void;
}

export function NameField({ draft, onChangeText, submit }: NameFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>NAME</Text>
      <TextInput
        value={draft}
        onChangeText={onChangeText}
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
