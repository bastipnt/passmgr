import { Image } from "react-native";

export async function loadImage(src: string) {
  try {
    const imgSize = await Image.getSize(src);
    if (imgSize.width === 48 && imgSize.height === 48) return "fail";
    else return "ok";
  } catch {
    return "fail";
  }
}
