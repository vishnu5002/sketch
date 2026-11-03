import { nanoid } from "nanoid";

export function makeId(): string {
  return nanoid();
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
