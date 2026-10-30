import { describe, expect, it } from "vitest";
import { checkAudioFile, formatDuration } from "@/lib/audio";

describe("fichiers audio", () => {
  it("formats acceptés et refusés", () => {
    expect(checkAudioFile("accueil.MP3", 1000, "audio/mpeg")).toEqual({ mime: "audio/mpeg", ext: "mp3" });
    expect(checkAudioFile("note.m4a", 1000, "audio/x-m4a")).toEqual({ mime: "audio/mp4", ext: "m4a" });
    expect(checkAudioFile("note.m4a", 1000, "video/mp4")).toEqual({ mime: "audio/mp4", ext: "m4a" }); // WhatsApp / iPhone
    expect(checkAudioFile("note.opus", 1000, "")).toEqual({ mime: "audio/ogg", ext: "opus" }); // message vocal WhatsApp
    expect(checkAudioFile("video.mp4", 1000, "video/mp4")).toHaveProperty("error");
    expect(checkAudioFile("doc.pdf", 1000, "application/pdf")).toHaveProperty("error");
    expect(checkAudioFile("gros.mp3", 5 * 1024 * 1024, "audio/mpeg")).toHaveProperty("error");
  });
  it("durée lisible", () => {
    expect(formatDuration(75)).toBe("1 min 15 s");
    expect(formatDuration(null)).toBeNull();
  });
});
