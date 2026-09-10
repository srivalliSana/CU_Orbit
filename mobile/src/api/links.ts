import { client } from "./client";

export interface LinkPreview {
  url: string;
  site_name: string;
  title: string;
  description: string | null;
  image: string | null;
}

export const getLinkPreview = (url: string) =>
  client.get<Partial<LinkPreview>>("/link-preview", { params: { url } }).then((res) => res.data);
