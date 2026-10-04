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
});
