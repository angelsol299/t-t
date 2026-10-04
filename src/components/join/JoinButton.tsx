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
