import Svg, { Circle, Path } from 'react-native-svg';
import { Design } from '@/theme/Design';

export function Logo({ size = 22, color = Design.color.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="36 36 128 128" fill={color} accessibilityLabel="Teton">
      <Circle cx={100} cy={57} r={19} />
      <Path fillRule="evenodd" d="M38 90H162A62 70 0 0 1 38 90ZM80 127a20 20 0 1 0 40 0a20 20 0 1 0-40 0Z" />
    </Svg>
  );
}
