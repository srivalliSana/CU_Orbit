import { client } from "./client";

export interface CustomEmoji {
  id: string;
  name: string;
  image_url: string;
}

export const getCustomEmojis = () => client.get<CustomEmoji[]>("/custom-emojis").then((res) => res.data);
