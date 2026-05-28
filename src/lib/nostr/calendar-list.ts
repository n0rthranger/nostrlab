import { KIND_CALENDAR_LIST, KIND_EVENT_LISTING } from "./kinds";
import type { NostrEvent } from "./types";
import { parseNostrCoordinate } from "./coordinates";
import { getTagValue, verifyNostrEvent } from "./verify";

export interface CalendarListExpectation {
  pubkey: string;
  dTag: string;
  title: string;
  description: string;
}

export function validateCalendarList(
  evt: NostrEvent | undefined,
  expected: CalendarListExpectation
): string | null {
  if (!evt) return null;
  if (!verifyNostrEvent(evt)) return "calendar list signature is invalid";
  if (evt.kind !== KIND_CALENDAR_LIST) return "calendar list has the wrong kind";
  if (evt.pubkey.toLowerCase() !== expected.pubkey.toLowerCase()) {
    return "calendar list signer does not match the calendar owner";
  }
  if (getTagValue(evt, "d") !== expected.dTag) return "calendar list slug mismatch";
  if (getTagValue(evt, "title") !== expected.title) return "calendar list title mismatch";
  if (evt.content !== expected.description) return "calendar list description mismatch";
  for (const coord of evt.tags.filter((tag) => tag[0] === "a").map((tag) => tag[1])) {
    if (coord && !parseNostrCoordinate(coord, KIND_EVENT_LISTING)) {
      return "calendar list references a non-calendar-event address";
    }
  }
  return null;
}
