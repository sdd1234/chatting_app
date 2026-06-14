// React Navigation 라우트 파라미터 타입.
export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Tabs: undefined;
  ChatRoom: { other: string };
  Settings: undefined;
};

export type TabParamList = {
  Friends: undefined;
  Chats: undefined;
};
