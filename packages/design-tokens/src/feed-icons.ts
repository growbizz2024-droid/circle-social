export const feedIconPaths = {
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  audio: "M4 10v4m4-8v12m4-15v18m4-15v12m4-8v4",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 13h4",
  people:
    "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m20 0v-3a4 4 0 0 0-3-4M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m7 0a4 4 0 0 1 0 8",
  person:
    "M20 21v-3a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v3ZM12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  comment:
    "M21 11.5a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.4-4.7A9 9 0 1 1 21 11.5Z",
  repeat:
    "m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3",
  share: "m22 2-7 20-4-9L2 9Zm0 0L11 13",
  bookmark: "M6 3h12v19l-6-4-6 4Z",
  plus: "M12 4v16M4 12h16",
  close: "m6 6 12 12M6 18 18 6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  arrow: "m14 5-7 7 7 7M7 12h14",
  refresh: "M20 7V3m0 4h-4M4 17v4m0-4h4M20 7A8 8 0 0 0 5 5M4 17a8 8 0 0 0 15 2",
  image: "M3 3h18v18H3Zm0 13 5-5 4 4 3-3 6 6M8 7h.01",
  check: "m4 12 5 5L20 6",
} as const;
export type FeedIconName = keyof typeof feedIconPaths;
