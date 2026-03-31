import { assertExistsAndNonEmptyString, NonEmptyString } from "./utils";

export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

export type MeetingId = NonEmptyString & { __type: "MeetingId" };
export const assertMeetingId = (s: string): MeetingId => {
  const nes = assertExistsAndNonEmptyString(s);
  return nes as MeetingId;
};

export type DailyRecordingType = "cloud" | "raw-tracks";
