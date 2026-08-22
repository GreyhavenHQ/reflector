import { describeJoinError, formatJoinError } from "../errorUtils";

describe("describeJoinError", () => {
  it("describes a meeting that has ended and offers a retry", () => {
    const result = describeJoinError({ detail: "Meeting has ended" });
    expect(result.title).toBe("This meeting has ended");
    expect(result.canRetry).toBe(true);
  });

  it("reads the detail from a nested API response", () => {
    const result = describeJoinError({
      response: { data: { detail: "Meeting is not active" } },
    });
    expect(result.title).toBe("This meeting is no longer active");
  });

  it("does not offer a retry for errors a retry cannot fix", () => {
    expect(describeJoinError({ detail: "Meeting not found" }).canRetry).toBe(
      false,
    );
    expect(describeJoinError({ detail: "Room not found" }).canRetry).toBe(
      false,
    );
  });

  it("keeps the unknown detail as the message", () => {
    const result = describeJoinError({ detail: "Something exploded" });
    expect(result.title).toBe("We couldn't join the meeting");
    expect(result.message).toBe("Something exploded");
  });

  it("falls back when there is no detail at all", () => {
    const result = describeJoinError(null);
    expect(result.title).toBe("We couldn't join the meeting");
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe("formatJoinError", () => {
  it("renders a single sentence for inline banners", () => {
    expect(formatJoinError({ detail: "Meeting has ended" })).toBe(
      "This meeting has ended. The organizer can start a new one.",
    );
  });
});
