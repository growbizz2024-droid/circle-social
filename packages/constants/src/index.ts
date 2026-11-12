export const APP_NAME = "Circle.social";
// Public URL identifiers. Changing slugs requires an explicit migration/redirect plan.
export const INITIAL_COMMUNITIES = [
  { name: "Bhasar", slug: "bhasar", description: "Speak freely about issues and everyday frustrations." },
  { name: "Papaki Pari", slug: "papaki-pari", description: "Friendship, experiences and conversations." },
  { name: "Dukhi Aatma", slug: "dukhi-aatma", description: "A space for difficult feelings and honest expression." },
  { name: "Khushi Ki Pujari", slug: "khushi-ki-pujari", description: "Celebrate little joys and everyday wins." },
  { name: "Baap Ka Paisa", slug: "baap-ka-paisa", description: "Lifestyle, purchases, possessions and flexing." },
] as const;
export type CommunitySlug = (typeof INITIAL_COMMUNITIES)[number]["slug"];
export const COMMUNITY_SLUGS: readonly CommunitySlug[] =
  INITIAL_COMMUNITIES.map((c) => c.slug);
export const QUEUE_NAMES = [
  "notifications",
  "media",
  "moderation",
  "maintenance",
] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];
export const JOB_DEFAULTS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 604800, count: 1000 },
} as const;

export const AVATARS = [
  { id: "otter", label: "Otter", symbol: "🦦" },
  { id: "owl", label: "Owl", symbol: "🦉" },
  { id: "fox", label: "Fox", symbol: "🦊" },
  { id: "cat", label: "Cat", symbol: "🐱" },
  { id: "koala", label: "Koala", symbol: "🐨" },
  { id: "bear", label: "Bear", symbol: "🐻" },
] as const;
export const PROFILE_ACCENTS = {
  INDIGO: "#4f46e5",
  TEAL: "#0f766e",
  ROSE: "#be185d",
  AMBER: "#92400e",
} as const;
export const PROFILE_THEMES = ["SYSTEM", "LIGHT", "DARK"] as const;
export type AvatarId = (typeof AVATARS)[number]["id"];

export const ONBOARDING_GENDERS = [
  { id: "MALE", label: "Male", symbol: "♂" },
  { id: "FEMALE", label: "Female", symbol: "♀" },
  { id: "PREFER_NOT_TO_SAY", label: "Prefer not to say", symbol: "○" },
] as const;
export const ONBOARDING_BACKGROUNDS = [
  {
    id: "ember",
    label: "Ember",
    description: "A little energy",
    path: "/onboarding/ember.jpg",
  },
  {
    id: "clouds",
    label: "Clouds",
    description: "Room to breathe",
    path: "/onboarding/clouds.jpg",
  },
  {
    id: "botanical",
    label: "Botanical",
    description: "Naturally you",
    path: "/onboarding/botanical.jpg",
  },
  {
    id: "alpine",
    label: "Alpine",
    description: "A fresh perspective",
    path: "/onboarding/alpine.jpg",
  },
  {
    id: "city",
    label: "City",
    description: "Find your people",
    path: "/onboarding/city.jpg",
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Quietly confident",
    path: "/onboarding/midnight.jpg",
  },
] as const;
export const ONBOARDING_VIBES = [
  {
    id: "BOLD",
    label: "Bold",
    description: "Vibrant and energetic",
    backgroundId: "ember",
    theme: "DARK",
  },
  {
    id: "CALM",
    label: "Calm",
    description: "Minimal and warm",
    backgroundId: "clouds",
    theme: "LIGHT",
  },
  {
    id: "DARK",
    label: "Dark",
    description: "Sleek and focused",
    backgroundId: "midnight",
    theme: "DARK",
  },
] as const;
export const INTERESTS = [
  { id: "technology", label: "Technology" },
  { id: "relationships", label: "Relationships" },
  { id: "lifestyle", label: "Lifestyle" },
  { id: "business", label: "Business" },
  { id: "education", label: "Education" },
  { id: "entertainment", label: "Entertainment" },
  { id: "food", label: "Food" },
  { id: "travel", label: "Travel" },
  { id: "fitness", label: "Fitness" },
  { id: "fashion", label: "Fashion" },
  { id: "mental-health", label: "Mental Health" },
  { id: "gaming", label: "Gaming" },
  { id: "books", label: "Books" },
  { id: "politics", label: "Politics" },
  { id: "local-issues", label: "Local Issues" },
] as const;
export const ONBOARDING_STEPS = [
  "splash",
  "welcome",
  "gender",
  "vibe",
  "background",
  "preview",
  "username",
  "avatar",
  "passkey",
  "recovery",
  "interests",
  "communities",
  "review",
  "complete",
] as const;
// Suggested public names are not credentials; uniqueness is enforced at registration.
export function onboardingHandles(entropy: readonly number[]): string[] {
  const adjectives = [
    "quiet",
    "curious",
    "gentle",
    "cosmic",
    "bright",
    "mellow",
    "lunar",
    "sunny",
  ];
  const animals = [
    "otter",
    "owl",
    "fox",
    "koala",
    "sparrow",
    "panda",
    "raven",
    "turtle",
  ];
  return Array.from({ length: 5 }, (_, i) =>
    `${adjectives[(entropy[i] ?? i) % adjectives.length]}_${animals[(entropy[i + 5] ?? i) % animals.length]}_${((entropy[i + 10] ?? i) * 31 + i) % 10000}`.replace(
      /_(\d+)$/,
      (_, digits: string) => "_" + digits.padStart(4, "0"),
    ),
  );
}

// Covers are bound to stable community slugs, never list position.
export const COMMUNITY_COVERS: Readonly<Record<string, string>> = {
  "bhasar": "/communities/bhasar.jpg",
  "papaki-pari": "/communities/papaki-pari.jpg",
  "dukhi-aatma": "/communities/dukhi-aatma.jpg",
  "khushi-ki-pujari": "/communities/khushi-ki-pujari.jpg",
  "baap-ka-paisa": "/communities/baap-ka-paisa.jpg",
};
