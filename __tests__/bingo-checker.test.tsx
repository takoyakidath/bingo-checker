import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BingoChecker from "@/app/components/bingo-checker";

describe("BingoChecker", () => {
  it("fills the card from sequential input and starts the game", () => {
    render(<BingoChecker />);

    const startButton = screen.getByRole("button", {
      name: "このカードで開始する",
    });
    expect((startButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(
      screen.getByPlaceholderText("例: 5 12 31 44 67 8 16 39 ..."),
      {
        target: {
          value: Array.from({ length: 24 }, (_, index) => index + 1).join(" "),
        },
      },
    );

    expect(screen.getByText("24/24")).toBeDefined();
    expect(
      (screen.getByLabelText("1行 B列") as HTMLInputElement).value,
    ).toBe("1");
    expect(
      (screen.getByLabelText("3行 G列") as HTMLInputElement).value,
    ).toBe("13");
    expect((startButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(startButton);

    expect(screen.getByLabelText("抽選番号")).toBeDefined();
    expect(screen.getByText("入力した番号")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "カメラでスキャン" }),
    ).toBeNull();
  });

  it("lets the user edit the card again during play", () => {
    render(<BingoChecker />);

    fireEvent.change(
      screen.getByPlaceholderText("例: 5 12 31 44 67 8 16 39 ..."),
      {
        target: {
          value: Array.from({ length: 24 }, (_, index) => index + 1).join(" "),
        },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "このカードで開始する" }));
    fireEvent.click(screen.getAllByRole("button", { name: "カードを編集" })[0]);

    expect(screen.getByText("カードの数字を入れる")).toBeDefined();
    expect(screen.getByText("現在の抽選履歴は保持したまま編集中です。開始し直した時点で、新しいカードとして履歴をリセットします。")).toBeDefined();
  });
});
