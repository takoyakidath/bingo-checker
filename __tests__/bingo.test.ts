import { describe, expect, it } from "vitest";
import {
  analyzeSequentialInput,
  buildCardFromDraft,
  createDraftFromSequence,
  getDrawErrorMessage,
  serializeDraftValues,
} from "@/app/lib/bingo";

describe("bingo helpers", () => {
  it("maps sequential input into the 24 bingo cells", () => {
    const draftValues = createDraftFromSequence(
      Array.from({ length: 24 }, (_, index) => index + 1),
    );

    expect(draftValues[0][0]).toBe("1");
    expect(draftValues[1][4]).toBe("10");
    expect(draftValues[2][2]).toBe("");
    expect(draftValues[2][3]).toBe("13");
    expect(draftValues[4][4]).toBe("24");
    expect(serializeDraftValues(draftValues)).toBe(
      "1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24",
    );
  });

  it("keeps valid sequential numbers and reports invalid ones", () => {
    const analysis = analyzeSequentialInput("1 ２ 100 0 33 abc 75");

    expect(analysis.numbers).toEqual([1, 2, 33, 75]);
    expect(analysis.invalidTokens).toEqual(["100", "0"]);
  });

  it("rejects duplicate numbers in the draft", () => {
    const result = buildCardFromDraft(
      createDraftFromSequence([
        1, 2, 3, 4, 5,
        6, 7, 8, 9, 10,
        11, 12, 13, 14, 15,
        16, 17, 18, 19, 20,
        21, 22, 23, 23,
      ]),
    );

    expect(result.card).toBeNull();
    expect(result.error).toContain("重複");
  });

  it("validates draw numbers", () => {
    expect(getDrawErrorMessage("", [])).toBe("抽選番号を入力してください。");
    expect(getDrawErrorMessage("76", [])).toContain("1 から 75");
    expect(getDrawErrorMessage("12", [12])).toBe(
      "その番号はすでに入力済みです。",
    );
    expect(getDrawErrorMessage("15", [])).toBeNull();
  });
});
