import { describe, expect, it } from "vitest";

import { activityText, ACTIVITY_VERBS } from "@/features/activity/presentation";
import { parseActivityPage } from "@/features/activity/url";

const NOW = new Date("2027-06-15T12:00:00.000Z");

describe("apresentação da atividade", () => {
  it("usa o fato mínimo quando ele existe", () => {
    expect(
      activityText(
        {
          verb: "date_suggested",
          metadata: {
            startsAt: "2027-06-14T23:30:00.000Z",
            allDay: false,
          },
        },
        NOW,
      ),
    ).toMatch(/^sugeriu Segunda-feira, 14 de junho, 20:30$/);

    expect(
      activityText(
        {
          verb: "vote_cast",
          metadata: {
            vote: "yes",
            startsAt: "2027-06-14T23:30:00.000Z",
          },
        },
        NOW,
      ),
    ).toContain("votou “Sim” em Segunda-feira, 14 de junho, 20:30");
  });

  it("degrada evento antigo sem inventar a data", () => {
    expect(
      activityText(
        {
          verb: "date_suggested",
          metadata: { optionId: "antiga", allDay: false },
        },
        NOW,
      ),
    ).toBe("sugeriu uma data");

    expect(
      activityText(
        { verb: "vote_cast", metadata: { vote: "maybe" } },
        NOW,
      ),
    ).toBe("votou “Talvez” em uma data");

    expect(
      activityText(
        { verb: "date_confirmed", metadata: { optionId: "antiga" } },
        NOW,
      ),
    ).toBe("confirmou uma data");
  });

  it("tem texto para cada verbo fechado do enum", () => {
    for (const verb of ACTIVITY_VERBS) {
      expect(activityText({ verb, metadata: null }, NOW).length).toBeGreaterThan(0);
    }
  });
});

describe("página da atividade na URL", () => {
  it("aceita inteiro positivo e recusa formatos hostis", () => {
    expect(parseActivityPage("2")).toBe(2);
    for (const raw of [undefined, "", "0", "-1", "abc", "1e3", "999999999999999999999"]) {
      expect(parseActivityPage(raw)).toBe(1);
    }
  });
});
