// 이름 기반 색상 아바타. 카톡 기본 프로필 느낌의 단색 원.
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
  const color = COLORS[hash(name) % COLORS.length];
  return (
    <div
      className="flex items-center justify-center rounded-2xl text-white font-bold shrink-0"
      style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}
    >
      {name[0]?.toUpperCase() || '?'}
    </div>
  );
}
