import { CHANNEL_NAME } from '@/config';
import { useOnlineCount } from '@/hooks/useOnlineCount';
import { Design } from '@/theme/Design';
import { ArrowRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface JoinButtonProps {
  submit: () => void;
  name: string;
  isEditing: boolean;
}

export function JoinButton({ submit, name, isEditing }: JoinButtonProps) {
  const online = useOnlineCount(isEditing);

  const buttonLabel = isEditing ? 'Save name' : `Join ${CHANNEL_NAME}`;

  return (
    <Pressable
      onPress={submit}
      disabled={!name}
      accessibilityRole="button"
      accessibilityLabel={buttonLabel}
      accessibilityState={{ disabled: !name }}
      style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed, !name && styles.ctaDisabled]}
    >
      <Text style={styles.ctaText}>{buttonLabel}</Text>
      <View style={styles.ctaRight}>
        {online !== null && <Text style={styles.ctaOnline}>{online} online</Text>}
        <ArrowRight size={20} color={Design.color.ground} strokeWidth={2} />
      </View>
    </Pressable>
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
