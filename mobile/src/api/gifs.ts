import { client } from "./client";

export interface GifResult {
  id: string;
  title: string;
  preview_url: string;
  url: string;
  width?: number;
  height?: number;
}

export const getTrendingGifs = () =>
  client.get<{ results: GifResult[] }>("/gifs/trending").then((res) => res.data.results);

export const searchGifs = (q: string) =>
  client.get<{ results: GifResult[] }>("/gifs/search", { params: { q } }).then((res) => res.data.results);
