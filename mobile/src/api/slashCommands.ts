import { client } from "./client";

export interface SlashCommandRow {
  command: string;
  description: string;
  usage_hint: string;
}

export const getSlashCommands = () =>
  client.get<SlashCommandRow[]>("/slash-commands").then((res) => res.data);
