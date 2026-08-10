import { client } from "./client";
import type { User } from "../types/api";

export const listUsers = () => client.get<User[]>("/users").then((res) => res.data);
