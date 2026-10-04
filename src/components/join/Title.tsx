import { Design } from '@/theme/Design';

import { StyleSheet, Text } from 'react-native';

export function Title() {
  return (
    <Text style={styles.title} accessibilityRole="header">
      What should the team call you?
    </Text>
  );
}

const styles = StyleSheet.create({
  title: { ...Design.typography.headline, color: Design.color.ink },
});
