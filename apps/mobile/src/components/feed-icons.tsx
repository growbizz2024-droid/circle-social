import { type ImageSourcePropType } from "react-native";
import { Image } from "../theme/primitives";
import type { FeedIconName } from "@circle/design-tokens";
const icons: Record<FeedIconName, ImageSourcePropType> = {
  audio: require("../../../../assets/feed-icons/audio.png"),
  home: require("../../../../assets/feed-icons/home.png"),
  search: require("../../../../assets/feed-icons/search.png"),
  bell: require("../../../../assets/feed-icons/bell.png"),
  people: require("../../../../assets/feed-icons/people.png"),
  person: require("../../../../assets/feed-icons/person.png"),
  heart: require("../../../../assets/feed-icons/heart.png"),
  comment: require("../../../../assets/feed-icons/comment.png"),
  repeat: require("../../../../assets/feed-icons/repeat.png"),
  share: require("../../../../assets/feed-icons/share.png"),
  bookmark: require("../../../../assets/feed-icons/bookmark.png"),
  plus: require("../../../../assets/feed-icons/plus.png"),
  close: require("../../../../assets/feed-icons/close.png"),
  more: require("../../../../assets/feed-icons/more.png"),
  arrow: require("../../../../assets/feed-icons/arrow.png"),
  refresh: require("../../../../assets/feed-icons/refresh.png"),
  image: require("../../../../assets/feed-icons/image.png"),
  check: require("../../../../assets/feed-icons/check.png"),
};
const filledIcons = {
  audio: require("../../../../assets/feed-icons/audio.png"),
  home: require("../../../../assets/feed-icons/home-filled.png"),
  heart: require("../../../../assets/feed-icons/heart-filled.png"),
  bookmark: require("../../../../assets/feed-icons/bookmark-filled.png"),
};
export default function FeedIcon({
  name,
  color = "#FFFFFF",
  size = 24,
  filled = false,
}: {
  name: FeedIconName;
  color?: string;
  size?: number;
  filled?: boolean;
}) {
  const source =
    filled && name in filledIcons
      ? filledIcons[name as keyof typeof filledIcons]
      : icons[name];
  return (
    <Image
      source={source}
      accessible={false}
      style={{ width: size, height: size, tintColor: color }}
    />
  );
}
