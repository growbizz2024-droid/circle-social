export type UserStatus = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
export type MembershipRole = "MEMBER" | "MODERATOR" | "OWNER";
export interface UserSummary {
  id: string;
  handle: string;
  status: UserStatus;
}
export interface CommunitySummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}
export interface MembershipSummary {
  userId: string;
  communityId: string;
  role: MembershipRole;
  joinedAt: string;
}
export interface ApiResponse<T> {
  data: T;
  requestId: string;
}
export interface ApiErrorBody {
  error: { code: string; message: string };
  requestId: string;
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type ProfileTheme = "SYSTEM" | "LIGHT" | "DARK";
export type ProfileAccent = "INDIGO" | "TEAL" | "ROSE" | "AMBER";
export interface UserProfile extends UserSummary {
  displayName: string | null;
  bio: string | null;
  avatarId: string;
  avatar?: AvatarSpec | null;
  activeTheme?: AppliedTheme | null;
  themeVersion?: number;
  profileTheme: ProfileTheme;
  profileAccent: ProfileAccent;
  profileVersion: number;
  onboardingCompletedAt: string | null;
  onboarding: OnboardingPreferences | null;
}
export interface ProfileUpdate {
  profileVersion: number;
  displayName?: string | null;
  bio?: string | null;
  avatarId?: string;
  profileTheme?: ProfileTheme;
  profileAccent?: ProfileAccent;
}
export interface LoginLocation {
  city: string | null;
  country: string;
  countryCode: string;
  approximate: true;
}
export interface SessionSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
  location: LoginLocation | null;
}
export interface PasskeySummary {
  id: string;
  createdAt: string;
  deviceType: string;
  backedUp: boolean;
  transports: string[];
}

export type OnboardingGender = "MALE" | "FEMALE" | "PREFER_NOT_TO_SAY";
export type OnboardingVibe = "BOLD" | "CALM" | "DARK";
export type BackgroundId =
  "ember" | "clouds" | "botanical" | "alpine" | "city" | "midnight";
export interface OnboardingPreferences {
  gender: OnboardingGender | null;
  vibe: OnboardingVibe;
  backgroundId: BackgroundId;
  interests: string[];
}
export interface OnboardingInput extends OnboardingPreferences {
  profileVersion: number;
}
export interface OnboardingDraft extends OnboardingPreferences {
  version: 1;
  intent: "create" | "edit";
  baseVersion?: number;
  step:
    | "splash"
    | "welcome"
    | "gender"
    | "vibe"
    | "background"
    | "preview"
    | "avatar"
    | "username"
    | "interests"
    | "passkey"
    | "recovery"
    | "communities"
    | "review"
    | "complete";
  handle: string;
  suggestions: string[];
  boundUserId?: string;
  communityIds?: string[];
  avatar?: AvatarSpec;
  readyToFinish: boolean;
}

export interface RecoveryStatus {
  confirmed: boolean;
  expiresAt: string | null;
}
export interface PostMedia {
  id: string;
  kind: "IMAGE" | "AUDIO";
  url: string;
  mimeType: string;
  durationSeconds: number | null;
}
export interface Discovery {
  topics: { id: string; label: string; posts: number }[];
  people: {
    handle: string;
    displayName: string | null;
    avatarId: string;
    avatar?: AvatarSpec | null;
    following: boolean;
  }[];
  communities: (CommunitySummary & { memberCount: number; joined: boolean })[];
}
export interface CommunityDetail extends CommunitySummary {
  memberCount: number;
  joined: boolean;
  postCount: number;
}
export interface FeedPost {
  attachments: PostMedia[];
  id: string;
  text: string;
  createdAt: string;
  mediaUrls: string[];
  author: {
    handle: string;
    displayName: string | null;
    avatarId: string;
    avatar?: AvatarSpec | null;
  };
  community: CommunitySummary;
  counts: { likes: number; comments: number; reposts: number };
  liked: boolean;
  saved: boolean;
  reposted: boolean;
  following: boolean;
}
export interface FeedComment {
  id: string;
  text: string;
  createdAt: string;
  author: {
    handle: string;
    displayName: string | null;
    avatarId: string;
    avatar?: AvatarSpec | null;
  };
}
export interface FeedActivity {
  id: string;
  kind: string;
  createdAt: string;
  readAt: string | null;
  postId: string | null;
  actor: { handle: string; avatarId: string; avatar?: AvatarSpec | null };
}
export interface HomeFeed {
  items: FeedPost[];
  communities: CommunitySummary[];
  interests: string[];
}

export interface AvatarConfig {
  head: string;
  body: string;
  skinTone: string;
  hair: string;
  hairColor: string;
  outfit: string;
  accessory: string;
  background: string;
  style: string;
}
export interface AvatarSpec {
  version: number;
  seed: string;
  config: AvatarConfig;
}
export interface AvatarRecord extends AvatarSpec {
  revision: number;
  defaultSeed: string;
}

export interface ThemeConfig {
  version: 1;
  appearance: "dark" | "light";
  background: {
    type: "solid" | "linear" | "radial" | "pattern" | "texture" | "image";
    stops: { color: string; position: number }[];
    angle: number;
    opacity: number;
    intensity: number;
    pattern: "dots" | "grid" | "waves" | "grain";
    imageId: string | null;
  };
  colors: {
    primaryBackground: string;
    secondaryBackground: string;
    surface: string;
    primaryAccent: string;
    secondaryAccent: string;
    primaryText: string;
    secondaryText: string;
    border: string;
    inputBackground: string;
    inputBorder: string;
    navigationBackground: string;
    navigationActive: string;
    buttonText: string;
  };
  typography: {
    family: "inter" | "system" | "rounded";
    baseSize: number;
    lineHeight: number;
  };
  effects: { radius: number; shadows: boolean; motion: boolean };
}
export interface SavedTheme {
  id: string;
  name: string;
  description: string;
  revision: number;
  config: ThemeConfig;
  supported: boolean;
  updatedAt: string;
}
export interface AppliedTheme {
  id: string;
  name: string;
  revision: number;
  config: ThemeConfig;
}
export interface ThemeState {
  activeTheme: AppliedTheme | null;
  themeVersion: number;
  defaultBackgroundId: string;
}
export interface ThemeLibrary {
  items: SavedTheme[];
  bytesUsed: number;
  byteLimit: number;
}
export interface ThemeDraft {
  name: string;
  description: string;
  config: ThemeConfig;
}
