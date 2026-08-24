import { transcriptSource } from "../transcript";

describe("transcriptSource", () => {
  it("returns the room name and a linkable room for room transcripts", () => {
    expect(
      transcriptSource({
        source_kind: "room",
        room_name: "team-standup",
        room_id: "room-123",
      }),
    ).toEqual({ label: "team-standup", roomName: "team-standup" });
  });

  it("falls back to the room id when the room name is missing", () => {
    expect(
      transcriptSource({
        source_kind: "room",
        room_name: null,
        room_id: "room-123",
      }),
    ).toEqual({ label: "room-123", roomName: null });
  });

  it("falls back to the source kind when a room transcript has no room at all", () => {
    expect(
      transcriptSource({
        source_kind: "room",
        room_name: null,
        room_id: null,
      }),
    ).toEqual({ label: "room", roomName: null });
  });

  it("uses the source kind for live and file transcripts", () => {
    expect(transcriptSource({ source_kind: "live" })).toEqual({
      label: "live",
      roomName: null,
    });
    expect(transcriptSource({ source_kind: "file" })).toEqual({
      label: "file",
      roomName: null,
    });
  });

  it("ignores blank room names and ids", () => {
    expect(
      transcriptSource({
        source_kind: "room",
        room_name: "   ",
        room_id: "",
      }),
    ).toEqual({ label: "room", roomName: null });
  });
});
