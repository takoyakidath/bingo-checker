import {
  BingoCard,
  COLUMN_LABELS,
  DraftValues,
  getCellName,
  isCellCoordinateCenter,
  isCellOpen,
} from "@/app/lib/bingo";

type EditableBingoGridProps = {
  mode: "edit";
  draftValues: DraftValues;
  onChangeCell: (
    rowIndex: number,
    columnIndex: number,
    nextValue: string,
  ) => void;
};

type ReadonlyBingoGridProps = {
  calledNumbers: Set<number>;
  card: BingoCard;
  mode: "play";
};

type BingoGridProps = EditableBingoGridProps | ReadonlyBingoGridProps;

export default function BingoGrid(props: BingoGridProps) {
  return (
    <div className="grid grid-cols-5 gap-2 sm:gap-3">
      {COLUMN_LABELS.map((label) => (
        <div
          key={label}
          className="flex aspect-square items-center justify-center rounded-[1.25rem] bg-stone-900 text-base font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] sm:text-lg"
        >
          {label}
        </div>
      ))}

      {props.mode === "edit"
        ? props.draftValues.map((row, rowIndex) =>
            row.map((value, columnIndex) => {
              const isCenter = isCellCoordinateCenter(rowIndex, columnIndex);

              if (isCenter) {
                return (
                  <div
                    key={`${rowIndex}-${columnIndex}`}
                    className="flex aspect-square flex-col items-center justify-center rounded-[1.5rem] border border-emerald-300 bg-emerald-100 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                  >
                    <span className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-emerald-700">
                      Center
                    </span>
                    <span className="mt-1.5 text-base font-semibold text-emerald-950 sm:text-xl">
                      FREE
                    </span>
                  </div>
                );
              }

              return (
                <label
                  key={`${rowIndex}-${columnIndex}`}
                  className="flex aspect-square items-center justify-center rounded-[1.5rem] border border-stone-200 bg-stone-50 px-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition focus-within:border-amber-400 focus-within:bg-white"
                >
                  <span className="sr-only">
                    {getCellName(rowIndex, columnIndex)}
                  </span>
                  <input
                    aria-label={getCellName(rowIndex, columnIndex)}
                    autoCapitalize="off"
                    autoComplete="off"
                    className="w-full border-none bg-transparent text-center text-[clamp(1rem,4.6vw,1.7rem)] font-semibold text-stone-900 outline-none placeholder:text-stone-300"
                    enterKeyHint="next"
                    inputMode="numeric"
                    maxLength={3}
                    pattern="[0-9]*"
                    placeholder="--"
                    spellCheck={false}
                    type="text"
                    value={value}
                    onChange={(event) =>
                      props.onChangeCell(
                        rowIndex,
                        columnIndex,
                        event.target.value,
                      )
                    }
                  />
                </label>
              );
            }),
          )
        : props.card.map((row, rowIndex) =>
            row.map((cell, columnIndex) => {
              const open = isCellOpen(cell, props.calledNumbers);

              return (
                <div
                  key={`${rowIndex}-${columnIndex}`}
                  className={`flex aspect-square flex-col items-center justify-center rounded-[1.5rem] border px-1.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition ${
                    open
                      ? "border-emerald-300 bg-emerald-100 text-emerald-950"
                      : "border-stone-200 bg-stone-50 text-stone-900"
                  }`}
                >
                  <span className="text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-stone-500 sm:text-[0.62rem]">
                    {cell.kind === "free" ? "FREE" : COLUMN_LABELS[columnIndex]}
                  </span>
                  <span className="mt-1.5 text-[clamp(1rem,4.8vw,1.7rem)] font-semibold">
                    {cell.kind === "free" ? cell.label : cell.value}
                  </span>
                </div>
              );
            }),
          )}
    </div>
  );
}
