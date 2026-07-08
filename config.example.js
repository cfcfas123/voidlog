window.VOID_LOG_CONFIG = {
  // "local"은 이 브라우저 안에서만 저장됩니다.
  // "supabase"로 바꾸면 친구들끼리 실제 실시간 동기화가 됩니다.
  mode: "supabase",
  spaceId: "friends-void",

  // 가벼운 입장문입니다. 공개 웹에서는 완전한 보안 장치가 아닙니다.
  accessCode: "friends-code",

  // Supabase Project Settings > API Keys에서 복사합니다.
  // Secret key/service_role key는 절대 넣지 마세요. publishable key 또는 anon public key만 넣습니다.
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_PUBLISHABLE_OR_ANON_PUBLIC_KEY",
};
