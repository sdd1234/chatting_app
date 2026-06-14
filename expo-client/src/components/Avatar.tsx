// 이름 기반 색상 아바타. 카톡 기본 프로필 느낌의 단색 라운드 사각형.
import { View, Text } from 'react-native';

const COLORS = [
  '#FFB6C1', '#FFD700', '#87CEEB', '#90EE90', '#DDA0DD',
  '#F08080', '#98D8C8', '#FFA07A', '#B0C4DE', '#D8BFD8',
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const color = COLORS[hash(name || '?') % COLORS.length];
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size * 0.3,
        backgroundColor: color, alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.42 }}>
        {name?.[0]?.toUpperCase() || '?'}
      </Text>
    </View>
  );
}
