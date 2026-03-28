export const GRID_SIZE = 5;
export const CENTER_INDEX = 2;
export const MIN_NUMBER = 1;
export const MAX_NUMBER = 75;
export const COLUMN_LABELS = ["B", "I", "N", "G", "O"] as const;
export const CARD_NUMBER_COUNT = GRID_SIZE * GRID_SIZE - 1;

export type NumberCell = {
  kind: "number";
  value: number;
};

export type FreeCell = {
  kind: "free";
  label: "FREE";
};

export type BingoCell = NumberCell | FreeCell;
export type BingoCard = BingoCell[][];
export type DraftValues = string[][];

export type Coordinate = {
  rowIndex: number;
  columnIndex: number;
};

export type CardBuildResult = {
  card: BingoCard | null;
  error: string | null;
};

export type SequentialInputAnalysis = {
  numbers: number[];
  invalidTokens: string[];
};

export const INPUT_COORDINATES: Coordinate[] = Array.from(
  { length: GRID_SIZE },
  (_, rowIndex) =>
    Array.from({ length: GRID_SIZE }, (_, columnIndex) => ({
      rowIndex,
      columnIndex,
    })),
)
  .flat()
  .filter(
    ({ rowIndex, columnIndex }) =>
      !isCellCoordinateCenter(rowIndex, columnIndex),
  );

export function createEmptyDraft(): DraftValues {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ""),
  );
}

export function isCellCoordinateCenter(rowIndex: number, columnIndex: number) {
  return rowIndex === CENTER_INDEX && columnIndex === CENTER_INDEX;
}

export function createDraftFromCard(card: BingoCard): DraftValues {
  return card.map((row) =>
    row.map((cell) => (cell.kind === "number" ? String(cell.value) : "")),
  );
}

export function createDraftFromSequence(
  values: Array<number | string>,
): DraftValues {
  const nextDraft = createEmptyDraft();

  INPUT_COORDINATES.forEach(({ rowIndex, columnIndex }, index) => {
    const currentValue = values[index];
    nextDraft[rowIndex][columnIndex] =
      currentValue === undefined ? "" : String(currentValue);
  });

  return nextDraft;
}

export function serializeDraftValues(draftValues: DraftValues) {
  return INPUT_COORDINATES.map(
    ({ rowIndex, columnIndex }) => draftValues[rowIndex][columnIndex].trim(),
  )
    .filter((value) => value.length > 0)
    .join(" ");
}

export function countFilledDraftCells(draftValues: DraftValues) {
  return INPUT_COORDINATES.filter(
    ({ rowIndex, columnIndex }) =>
      draftValues[rowIndex][columnIndex].trim().length > 0,
  ).length;
}

export function getCellName(rowIndex: number, columnIndex: number) {
  return `${rowIndex + 1}行 ${COLUMN_LABELS[columnIndex]}列`;
}

export function normalizeDigitInput(value: string) {
  return value.normalize("NFKC").replace(/[^\d]/g, "");
}

export function normalizeSequentialInput(value: string) {
  return value.normalize("NFKC").replace(/[^\d\s,]/g, " ");
}

export function analyzeSequentialInput(
  value: string,
): SequentialInputAnalysis {
  const tokens = normalizeSequentialInput(value)
    .split(/[\s,]+/)
    .filter((token) => token.length > 0);

  return tokens.reduce<SequentialInputAnalysis>(
    (result, token) => {
      const numericValue = Number(token);

      if (
        Number.isInteger(numericValue) &&
        numericValue >= MIN_NUMBER &&
        numericValue <= MAX_NUMBER
      ) {
        result.numbers.push(numericValue);
      } else {
        result.invalidTokens.push(token);
      }

      return result;
    },
    {
      numbers: [],
      invalidTokens: [],
    },
  );
}

export function extractNumbersFromSequentialInput(value: string) {
  return analyzeSequentialInput(value).numbers;
}

export function buildCardFromDraft(draftValues: DraftValues): CardBuildResult {
  const nextCard: BingoCard = [];
  const seenNumbers = new Set<number>();

  for (let rowIndex = 0; rowIndex < GRID_SIZE; rowIndex += 1) {
    const nextRow: BingoCell[] = [];

    for (let columnIndex = 0; columnIndex < GRID_SIZE; columnIndex += 1) {
      if (isCellCoordinateCenter(rowIndex, columnIndex)) {
        nextRow.push({ kind: "free", label: "FREE" });
        continue;
      }

      const rawValue = normalizeDigitInput(
        draftValues[rowIndex]?.[columnIndex]?.trim() ?? "",
      );

      if (rawValue.length === 0) {
        return {
          card: null,
          error: `${getCellName(rowIndex, columnIndex)} の数字を入力してください。`,
        };
      }

      const numericValue = Number(rawValue);

      if (!Number.isInteger(numericValue)) {
        return {
          card: null,
          error: `${getCellName(rowIndex, columnIndex)} は整数で入力してください。`,
        };
      }

      if (numericValue < MIN_NUMBER || numericValue > MAX_NUMBER) {
        return {
          card: null,
          error: `${getCellName(rowIndex, columnIndex)} は ${MIN_NUMBER} から ${MAX_NUMBER} の範囲で入力してください。`,
        };
      }

      if (seenNumbers.has(numericValue)) {
        return {
          card: null,
          error: `カード内で ${numericValue} が重複しています。`,
        };
      }

      seenNumbers.add(numericValue);
      nextRow.push({ kind: "number", value: numericValue });
    }

    nextCard.push(nextRow);
  }

  return { card: nextCard, error: null };
}

export function isCellOpen(cell: BingoCell, calledNumbers: Set<number>) {
  return cell.kind === "free" || calledNumbers.has(cell.value);
}

export function getDrawErrorMessage(rawValue: string, calledNumbers: number[]) {
  const trimmedValue = normalizeDigitInput(rawValue.trim());

  if (trimmedValue.length === 0) {
    return "抽選番号を入力してください。";
  }

  const numericValue = Number(trimmedValue);

  if (!Number.isInteger(numericValue)) {
    return "抽選番号は整数で入力してください。";
  }

  if (numericValue < MIN_NUMBER || numericValue > MAX_NUMBER) {
    return `抽選番号は ${MIN_NUMBER} から ${MAX_NUMBER} の範囲で入力してください。`;
  }

  if (calledNumbers.includes(numericValue)) {
    return "その番号はすでに入力済みです。";
  }

  return null;
}
