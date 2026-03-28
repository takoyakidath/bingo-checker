"use client";

import {
  ChangeEvent,
  FormEvent,
  startTransition,
  useEffect,
  useRef,
  useState,
} from "react";

const GRID_SIZE = 5;
const CENTER_INDEX = 2;
const MIN_NUMBER = 1;
const MAX_NUMBER = 75;
const STORAGE_KEY = "bingo-checker-state";
const STORAGE_VERSION = 1;
const COLUMN_LABELS = ["B", "I", "N", "G", "O"] as const;

type NumberCell = {
  kind: "number";
  value: number;
};

type FreeCell = {
  kind: "free";
  label: "FREE";
};

type BingoCell = NumberCell | FreeCell;
type BingoCard = BingoCell[][];

type SavedGameState = {
  version: typeof STORAGE_VERSION;
  card: BingoCard;
  calledNumbers: number[];
};

type Coordinate = {
  rowIndex: number;
  columnIndex: number;
};

function createEmptyDraft() {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ""),
  );
}

function isCellCoordinateCenter(rowIndex: number, columnIndex: number) {
  return rowIndex === CENTER_INDEX && columnIndex === CENTER_INDEX;
}

const INPUT_COORDINATES: Coordinate[] = Array.from(
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

function createDraftFromCard(card: BingoCard) {
  return card.map((row) =>
    row.map((cell) => (cell.kind === "number" ? String(cell.value) : "")),
  );
}

function createDraftFromSequence(values: Array<number | string>) {
  const nextDraft = createEmptyDraft();

  INPUT_COORDINATES.forEach(({ rowIndex, columnIndex }, index) => {
    const currentValue = values[index];
    nextDraft[rowIndex][columnIndex] =
      currentValue === undefined ? "" : String(currentValue);
  });

  return nextDraft;
}

function serializeDraftValues(draftValues: string[][]) {
  return INPUT_COORDINATES.map(
    ({ rowIndex, columnIndex }) => draftValues[rowIndex][columnIndex].trim(),
  )
    .filter((value) => value.length > 0)
    .join(" ");
}

function getCellName(rowIndex: number, columnIndex: number) {
  return `${rowIndex + 1}行 ${COLUMN_LABELS[columnIndex]}列`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumberCell(value: unknown): value is NumberCell {
  return (
    isRecord(value) &&
    value.kind === "number" &&
    typeof value.value === "number" &&
    Number.isInteger(value.value) &&
    value.value >= MIN_NUMBER &&
    value.value <= MAX_NUMBER
  );
}

function isFreeCell(value: unknown): value is FreeCell {
  return isRecord(value) && value.kind === "free" && value.label === "FREE";
}

function isBingoCard(value: unknown): value is BingoCard {
  if (!Array.isArray(value) || value.length !== GRID_SIZE) {
    return false;
  }

  const seenNumbers = new Set<number>();

  return value.every((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== GRID_SIZE) {
      return false;
    }

    return row.every((cell, columnIndex) => {
      if (isCellCoordinateCenter(rowIndex, columnIndex)) {
        return isFreeCell(cell);
      }

      if (!isNumberCell(cell) || seenNumbers.has(cell.value)) {
        return false;
      }

      seenNumbers.add(cell.value);
      return true;
    });
  });
}

function isCalledNumbers(value: unknown): value is number[] {
  if (!Array.isArray(value)) {
    return false;
  }

  const seenNumbers = new Set<number>();

  return value.every((item) => {
    if (
      typeof item !== "number" ||
      !Number.isInteger(item) ||
      item < MIN_NUMBER ||
      item > MAX_NUMBER ||
      seenNumbers.has(item)
    ) {
      return false;
    }

    seenNumbers.add(item);
    return true;
  });
}

function parseSavedGameState(rawState: string): SavedGameState | null {
  try {
    const parsedState = JSON.parse(rawState) as unknown;

    if (
      !isRecord(parsedState) ||
      parsedState.version !== STORAGE_VERSION ||
      !isBingoCard(parsedState.card) ||
      !isCalledNumbers(parsedState.calledNumbers)
    ) {
      return null;
    }

    return {
      version: STORAGE_VERSION,
      card: parsedState.card,
      calledNumbers: parsedState.calledNumbers,
    };
  } catch {
    return null;
  }
}

function normalizeDigitInput(value: string) {
  return value.normalize("NFKC").replace(/[^\d]/g, "");
}

function normalizeSequentialInput(value: string) {
  return value.normalize("NFKC").replace(/[^\d\s]/g, " ");
}

function extractNumbersFromSequentialInput(value: string) {
  return (normalizeSequentialInput(value).match(/\d+/g) ?? [])
    .map((token) => Number(token))
    .filter(
      (number) =>
        Number.isInteger(number) &&
        number >= MIN_NUMBER &&
        number <= MAX_NUMBER,
    );
}

function buildCardFromDraft(draftValues: string[][]) {
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

      if (!/^\d+$/.test(rawValue)) {
        return {
          card: null,
          error: `${getCellName(rowIndex, columnIndex)} は整数で入力してください。`,
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

function isCellOpen(cell: BingoCell, calledNumbers: Set<number>) {
  return cell.kind === "free" || calledNumbers.has(cell.value);
}

function getDrawErrorMessage(rawValue: string, calledNumbers: number[]) {
  const trimmedValue = normalizeDigitInput(rawValue.trim());

  if (trimmedValue.length === 0) {
    return "抽選番号を入力してください。";
  }

  if (!/^\d+$/.test(trimmedValue)) {
    return "抽選番号は整数で入力してください。";
  }

  const numericValue = Number(trimmedValue);

  if (numericValue < MIN_NUMBER || numericValue > MAX_NUMBER) {
    return `抽選番号は ${MIN_NUMBER} から ${MAX_NUMBER} の範囲で入力してください。`;
  }

  if (calledNumbers.includes(numericValue)) {
    return "その番号はすでに入力済みです。";
  }

  return null;
}

export default function BingoChecker() {
  const [draftValues, setDraftValues] = useState<string[][]>(createEmptyDraft);
  const [confirmedCard, setConfirmedCard] = useState<BingoCard | null>(null);
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [sequentialInput, setSequentialInput] = useState("");
  const [drawInput, setDrawInput] = useState("");
  const [cardError, setCardError] = useState("");
  const [drawError, setDrawError] = useState("");
  const [scanStatus, setScanStatus] = useState("");
  const [scanError, setScanError] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isPreparingCamera, setIsPreparingCamera] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [hasLoadedState, setHasLoadedState] = useState(false);
  const [isEditingCard, setIsEditingCard] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const savedState = window.localStorage.getItem(STORAGE_KEY);

    if (!savedState) {
      startTransition(() => {
        setHasLoadedState(true);
      });
      return;
    }

    const parsedState = parseSavedGameState(savedState);

    if (!parsedState) {
      window.localStorage.removeItem(STORAGE_KEY);
      startTransition(() => {
        setHasLoadedState(true);
      });
      return;
    }

    startTransition(() => {
      const nextDraft = createDraftFromCard(parsedState.card);
      setConfirmedCard(parsedState.card);
      setDraftValues(nextDraft);
      setSequentialInput(serializeDraftValues(nextDraft));
      setCalledNumbers(parsedState.calledNumbers);
      setHasLoadedState(true);
    });
  }, []);

  useEffect(() => {
    if (!hasLoadedState) {
      return;
    }

    if (!confirmedCard) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const savedState: SavedGameState = {
      version: STORAGE_VERSION,
      card: confirmedCard,
      calledNumbers,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
  }, [calledNumbers, confirmedCard, hasLoadedState]);

  const isSetupMode = !confirmedCard || isEditingCard;
  const calledNumberSet = new Set(calledNumbers);
  const filledDraftCount = draftValues
    .flat()
    .filter((value) => value.trim().length > 0).length;
  const reversedCalledNumbers = [...calledNumbers].reverse();
  const sequentialNumbers = extractNumbersFromSequentialInput(sequentialInput);
  const sequentialOverflowCount = Math.max(
    0,
    sequentialNumbers.length - INPUT_COORDINATES.length,
  );
  const remainingDraftCount = INPUT_COORDINATES.length - filledDraftCount;

  function releaseCameraStream() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function closeCamera() {
    releaseCameraStream();
    setIsCameraOpen(false);
    setIsPreparingCamera(false);
  }

  function startEditingFromConfirmedCard() {
    if (!confirmedCard) {
      return;
    }

    const nextDraft = createDraftFromCard(confirmedCard);

    setDraftValues(nextDraft);
    setSequentialInput(serializeDraftValues(nextDraft));
    setDrawInput("");
    setDrawError("");
    setCardError("");
    setScanError("");
    setScanStatus("");
    setCameraError("");
    setIsEditingCard(true);
  }

  useEffect(() => {
    if (!isCameraOpen || !videoRef.current || !cameraStreamRef.current) {
      return;
    }

    const videoElement = videoRef.current;
    videoElement.srcObject = cameraStreamRef.current;
    void videoElement.play().catch(() => {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      videoElement.srcObject = null;
      setCameraError(
        "カメラを開始できませんでした。もう一度開くか、写真から読み込んでください。",
      );
      setIsCameraOpen(false);
      setIsPreparingCamera(false);
    });
  }, [isCameraOpen]);

  useEffect(() => {
    return () => {
      releaseCameraStream();
    };
  }, []);

  function updateDraftValue(
    rowIndex: number,
    columnIndex: number,
    nextValue: string,
  ) {
    const sanitizedValue = normalizeDigitInput(nextValue);

    setCardError("");
    setScanError("");
    setScanStatus("");
    setDraftValues((currentValues) => {
      const nextDraft = currentValues.map((row, currentRowIndex) =>
        row.map((value, currentColumnIndex) => {
          if (
            currentRowIndex === rowIndex &&
            currentColumnIndex === columnIndex
          ) {
            return sanitizedValue;
          }

          return value;
        }),
      );

      setSequentialInput(serializeDraftValues(nextDraft));
      return nextDraft;
    });
  }

  function handleSequentialInputChange(
    event: ChangeEvent<HTMLTextAreaElement>,
  ) {
    const nextInput = normalizeSequentialInput(event.target.value);
    const nextNumbers = extractNumbersFromSequentialInput(nextInput).slice(
      0,
      INPUT_COORDINATES.length,
    );

    setSequentialInput(nextInput);
    setDraftValues(createDraftFromSequence(nextNumbers));
    setCardError("");
    setScanError("");
    setScanStatus("");
  }

  function handleCardSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const { card, error } = buildCardFromDraft(draftValues);

    if (!card || error) {
      setCardError(error ?? "カードを登録できませんでした。");
      return;
    }

    const nextDraft = createDraftFromCard(card);

    setConfirmedCard(card);
    setDraftValues(nextDraft);
    setSequentialInput(serializeDraftValues(nextDraft));
    setCalledNumbers([]);
    setDrawInput("");
    setCardError("");
    setDrawError("");
    setScanStatus("");
    setScanError("");
    setCameraError("");
    closeCamera();
    setIsEditingCard(false);
  }

  function handleDrawSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!confirmedCard) {
      return;
    }

    const error = getDrawErrorMessage(drawInput, calledNumbers);

    if (error) {
      setDrawError(error);
      return;
    }

    const numericValue = Number(normalizeDigitInput(drawInput.trim()));
    setCalledNumbers((currentNumbers) => [...currentNumbers, numericValue]);
    setDrawInput("");
    setDrawError("");
  }

  function handleCancelEditing() {
    if (!confirmedCard) {
      return;
    }

    const nextDraft = createDraftFromCard(confirmedCard);

    setDraftValues(nextDraft);
    setSequentialInput(serializeDraftValues(nextDraft));
    setCardError("");
    setScanError("");
    setScanStatus("");
    setCameraError("");
    closeCamera();
    setIsEditingCard(false);
  }

  function handleResetGame() {
    closeCamera();
    setConfirmedCard(null);
    setDraftValues(createEmptyDraft());
    setSequentialInput("");
    setIsEditingCard(false);
    setCalledNumbers([]);
    setDrawInput("");
    setDrawError("");
    setCardError("");
    setScanStatus("");
    setScanError("");
    setCameraError("");
  }

  function handleUndoLastNumber() {
    setCalledNumbers((currentNumbers) => currentNumbers.slice(0, -1));
    setDrawError("");
  }

  function triggerScanPicker() {
    if (isScanning || isPreparingCamera) {
      return;
    }

    closeCamera();
    setScanError("");
    setScanStatus("");
    setCameraError("");
    scanInputRef.current?.click();
  }

  async function openCamera() {
    if (isScanning || isPreparingCamera) {
      return;
    }

    if (confirmedCard && !isSetupMode) {
      startEditingFromConfirmedCard();
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "このブラウザではカメラを使えません。写真から読み込むを使ってください。",
      );
      return;
    }

    closeCamera();
    setIsPreparingCamera(true);
    setCameraError("");
    setScanError("");
    setScanStatus("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: {
            ideal: "environment",
          },
        },
      });

      cameraStreamRef.current = stream;
      setIsCameraOpen(true);
    } catch (error) {
      setCameraError(
        error instanceof Error
          ? `カメラを開けませんでした。${error.message}`
          : "カメラを開けませんでした。写真から読み込むを使ってください。",
      );
    } finally {
      setIsPreparingCamera(false);
    }
  }

  async function captureFromCamera() {
    const videoElement = videoRef.current;

    if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      setCameraError("カメラの準備がまだ終わっていません。少し待ってから撮影してください。");
      return;
    }

    const canvasElement = document.createElement("canvas");
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    const context = canvasElement.getContext("2d");

    if (!context) {
      setCameraError("画像を取り出せませんでした。もう一度試してください。");
      return;
    }

    context.drawImage(
      videoElement,
      0,
      0,
      canvasElement.width,
      canvasElement.height,
    );

    const imageBlob = await new Promise<Blob | null>((resolve) => {
      canvasElement.toBlob(resolve, "image/jpeg", 0.92);
    });

    if (!imageBlob) {
      setCameraError("撮影画像を作れませんでした。もう一度試してください。");
      return;
    }

    closeCamera();

    await runScan(
      new File([imageBlob], `bingo-camera-${Date.now()}.jpg`, {
        type: "image/jpeg",
      }),
    );
  }

  async function runScan(file: File) {
    setIsScanning(true);
    setScanError("");
    setScanStatus("OCR を準備中です...");

    let worker: {
      setParameters: (params: Record<string, string>) => Promise<unknown>;
      recognize: (image: File) => Promise<{ data: { text: string } }>;
      terminate: () => Promise<unknown>;
    } | null = null;

    try {
      const Tesseract = await import("tesseract.js");

      worker = await Tesseract.createWorker("eng", 1, {
        logger: ({ progress, status }) => {
          const translatedStatus =
            status === "recognizing text"
              ? "数字を読み取り中"
              : status === "initializing tesseract"
                ? "OCR を初期化中"
                : status === "loading language traineddata"
                  ? "言語データを読み込み中"
                  : "スキャン中";

          setScanStatus(`${translatedStatus} ${Math.round(progress * 100)}%`);
        },
      });

      await worker.setParameters({
        tessedit_char_whitelist: "0123456789",
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
        user_defined_dpi: "300",
      });

      const {
        data: { text },
      } = await worker.recognize(file);

      const recognizedNumbers = extractNumbersFromSequentialInput(text);

      if (recognizedNumbers.length === 0) {
        setScanStatus("");
        setScanError(
          "数字を読み取れませんでした。写真を撮り直すか、下の文字入力で補正してください。",
        );
        return;
      }

      const nextNumbers = recognizedNumbers.slice(0, INPUT_COORDINATES.length);
      const nextDraft = createDraftFromSequence(nextNumbers);

      setDraftValues(nextDraft);
      setSequentialInput(nextNumbers.join(" "));
      setCardError("");

      if (recognizedNumbers.length < INPUT_COORDINATES.length) {
        setScanStatus("");
        setScanError(
          `読み取れた数字は ${recognizedNumbers.length} 個でした。足りないマスは文字入力かマス入力で補正してください。`,
        );
        return;
      }

      if (recognizedNumbers.length > INPUT_COORDINATES.length) {
        setScanStatus("");
        setScanError(
          `読み取れた数字が ${recognizedNumbers.length} 個あったため、先頭24個だけ反映しました。必要なら文字入力で直してください。`,
        );
        return;
      }

      setScanStatus("24個の数字を取り込みました。内容を確認して保存してください。");
    } catch (error) {
      setScanStatus("");
      setScanError(
        error instanceof Error
          ? `スキャンに失敗しました。${error.message}`
          : "スキャンに失敗しました。もう一度試してください。",
      );
    } finally {
      setIsScanning(false);

      if (worker) {
        await worker.terminate();
      }
    }
  }

  async function handleScanFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (confirmedCard && !isSetupMode) {
      startEditingFromConfirmedCard();
    }

    await runScan(file);
  }

  if (!hasLoadedState) {
    return (
      <section className="rounded-[2rem] border border-white/70 bg-white/82 p-6 shadow-[0_20px_80px_rgba(58,42,19,0.08)] backdrop-blur sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700/80">
          Readying
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-stone-900">
          保存済みのカードを読み込み中です
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-7 text-stone-600">
          以前のカードと抽選履歴があれば、自動で復元します。
        </p>
      </section>
    );
  }

  return (
    <div
      className={`mx-auto flex max-w-3xl flex-col gap-4 ${
        isSetupMode ? "" : "pb-32 md:pb-0"
      }`}
    >
      <input
        ref={scanInputRef}
        accept="image/*"
        className="hidden"
        type="file"
        onChange={handleScanFileChange}
      />

      <section className="rounded-[2.2rem] border border-white/70 bg-white/88 p-3 shadow-[0_26px_80px_rgba(58,42,19,0.08)] backdrop-blur sm:p-5">
        {isSetupMode ? (
          <form className="space-y-5" onSubmit={handleCardSubmit}>
            <div className="space-y-2 px-1">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Card Setup
              </p>
              <h2 className="text-xl font-semibold text-stone-950 sm:text-2xl">
                カードの数字を入れる
              </h2>
              <p className="text-sm leading-6 text-stone-600">
                カメラで読み込むか、数字をスペース区切りでまとめて入れてください。
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                className="inline-flex h-14 items-center justify-center rounded-[1.35rem] bg-stone-900 px-5 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                onClick={openCamera}
                disabled={isScanning || isPreparingCamera}
              >
                {isPreparingCamera ? "カメラを起動中..." : "カメラでスキャン"}
              </button>
              <button
                className="inline-flex h-14 items-center justify-center rounded-[1.35rem] border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                onClick={triggerScanPicker}
                disabled={isScanning || isPreparingCamera}
              >
                写真から読み込む
              </button>
            </div>

            {isCameraOpen ? (
              <div className="rounded-[1.8rem] border border-stone-200 bg-stone-950 p-3 text-white shadow-[0_20px_60px_rgba(28,25,23,0.24)]">
                <div className="overflow-hidden rounded-[1.4rem] bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    className="aspect-[3/4] w-full object-cover"
                    muted
                    playsInline
                  />
                </div>
                <p className="mt-3 px-1 text-sm leading-6 text-white/72">
                  カード全体が入るように合わせてから撮影してください。
                </p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <button
                    className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-amber-400 px-6 text-sm font-semibold text-stone-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    onClick={captureFromCamera}
                    disabled={isScanning}
                  >
                    この写真で取り込む
                  </button>
                  <button
                    className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/8 px-6 text-sm font-semibold text-white transition hover:bg-white/14"
                    type="button"
                    onClick={closeCamera}
                  >
                    閉じる
                  </button>
                </div>
              </div>
            ) : null}

            {cameraError ? (
              <div className="rounded-[1.4rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                {cameraError}
              </div>
            ) : null}

            {scanStatus ? (
              <div className="rounded-[1.4rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-700">
                {scanStatus}
              </div>
            ) : null}

            {scanError ? (
              <div className="rounded-[1.4rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                {scanError}
              </div>
            ) : null}

            <div className="rounded-[1.6rem] border border-stone-200 bg-stone-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                    文字入力
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-700">
                    1個目を入れてスペース、2個目を入れてスペースのように続けると、左上から順に 24 マスへ入ります。
                  </p>
                </div>
                <div className="rounded-full bg-white px-3 py-2 text-xs font-semibold tracking-[0.16em] text-stone-700 ring-1 ring-inset ring-stone-200">
                  {Math.min(sequentialNumbers.length, INPUT_COORDINATES.length)}
                  /24
                </div>
              </div>
              <textarea
                className="mt-3 min-h-28 w-full resize-y rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 text-base leading-7 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-400"
                placeholder="例: 5 12 31 44 67 8 16 39 ..."
                value={sequentialInput}
                onChange={handleSequentialInputChange}
              />
              <p className="mt-2 text-xs leading-6 text-stone-500">
                スペース、改行、カンマで区切れます。1 から 75 の数字だけを使ってください。
              </p>
              {sequentialOverflowCount > 0 ? (
                <p className="mt-2 text-xs leading-6 text-amber-700">
                  25個目以降の {sequentialOverflowCount} 個は無視しています。
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-5 gap-2 sm:gap-3">
              {COLUMN_LABELS.map((label) => (
                <div
                  key={label}
                  className="flex aspect-square items-center justify-center rounded-[1.25rem] bg-stone-900 text-base font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] sm:text-lg"
                >
                  {label}
                </div>
              ))}
              {draftValues.map((row, rowIndex) =>
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
                        autoComplete="off"
                        className="w-full border-none bg-transparent text-center text-[clamp(1rem,4.6vw,1.7rem)] font-semibold text-stone-900 outline-none placeholder:text-stone-300"
                        inputMode="numeric"
                        maxLength={3}
                        pattern="[0-9]*"
                        placeholder="--"
                        type="text"
                        value={value}
                        onChange={(event) =>
                          updateDraftValue(
                            rowIndex,
                            columnIndex,
                            event.target.value,
                          )
                        }
                      />
                    </label>
                  );
                }),
              )}
            </div>

            {cardError ? (
              <div className="rounded-[1.4rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                {cardError}
              </div>
            ) : null}

            {confirmedCard && isEditingCard ? (
              <div className="rounded-[1.4rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                現在の抽選履歴は保持したまま編集中です。保存した時点で、新しいカードとして履歴をリセットします。
              </div>
            ) : null}

            <div className="rounded-[1.6rem] bg-stone-900 p-4 text-white shadow-[0_20px_50px_rgba(28,25,23,0.28)]">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-white/60">
                    Ready
                  </p>
                  <p className="mt-2 text-3xl font-semibold">
                    {filledDraftCount}
                    <span className="ml-2 text-base font-medium text-white/55">
                      / 24
                    </span>
                  </p>
                </div>
                <p className="text-right text-xs leading-5 text-white/68">
                  {remainingDraftCount === 0
                    ? "数字がそろったら開始できます"
                    : `残り ${remainingDraftCount} マス`}
                </p>
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-amber-400 px-6 text-sm font-semibold text-stone-950 transition hover:bg-amber-300"
                  type="submit"
                >
                  このカードで開始する
                </button>
                {confirmedCard && isEditingCard ? (
                  <button
                    className="inline-flex h-12 items-center justify-center rounded-full border border-white/20 bg-white/8 px-6 text-sm font-semibold text-white transition hover:bg-white/14"
                    type="button"
                    onClick={handleCancelEditing}
                  >
                    編集をやめる
                  </button>
                ) : null}
              </div>
            </div>
          </form>
        ) : confirmedCard ? (
          <div className="space-y-4">
            <div className="grid grid-cols-5 gap-2 sm:gap-3">
              {COLUMN_LABELS.map((label) => (
                <div
                  key={label}
                  className="flex aspect-square items-center justify-center rounded-[1.25rem] bg-stone-900 text-base font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] sm:text-lg"
                >
                  {label}
                </div>
              ))}
              {confirmedCard.map((row, rowIndex) =>
                row.map((cell, columnIndex) => {
                  const open = isCellOpen(cell, calledNumberSet);

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

            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                type="button"
                onClick={handleUndoLastNumber}
                disabled={calledNumbers.length === 0}
              >
                直前を取り消す
              </button>
              <button
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                type="button"
                onClick={handleResetGame}
              >
                ゲームをリセット
              </button>
              <button
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                onClick={triggerScanPicker}
                disabled={isScanning}
              >
                {isScanning ? "スキャン中..." : "スキャン"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
      {isSetupMode ? null : (
        <>
          <section className="rounded-[2rem] border border-white/70 bg-white/82 p-4 shadow-[0_22px_80px_rgba(58,42,19,0.08)] backdrop-blur sm:p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-amber-700/80">
                  History
                </p>
                <h3 className="mt-2 text-xl font-semibold text-stone-900">
                  入力した番号
                </h3>
              </div>
              <div className="rounded-full bg-stone-900 px-3 py-2 text-xs font-semibold tracking-[0.16em] text-white">
                {calledNumbers.length} 件
              </div>
            </div>

            {calledNumbers.length === 0 ? (
              <p className="mt-4 rounded-[1.5rem] border border-dashed border-stone-300 bg-stone-50 px-4 py-5 text-sm leading-7 text-stone-500">
                まだ抽選番号はありません。下の操作バーから番号を追加すると、ここへ新しい順で並びます。
              </p>
            ) : (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {reversedCalledNumbers.map((number, index) => (
                  <div
                    key={`${number}-${index}`}
                    className={`inline-flex h-12 min-w-14 shrink-0 items-center justify-center rounded-full px-4 text-sm font-semibold ${
                      index === 0
                        ? "bg-stone-900 text-white"
                        : "bg-stone-100 text-stone-700 ring-1 ring-inset ring-stone-200"
                    }`}
                  >
                    {number}
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-3xl md:static md:inset-auto">
            <form
              className="rounded-[1.9rem] border border-stone-900/85 bg-stone-950/96 p-3 text-white shadow-[0_24px_70px_rgba(28,25,23,0.38)] backdrop-blur"
              onSubmit={handleDrawSubmit}
            >
              <div className="flex items-center justify-between gap-3 px-1 pb-3">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-white/55">
                    Draw Number
                  </p>
                  <p className="mt-1 text-sm text-white/78">
                    抽選番号を入力してカードを開く
                  </p>
                </div>
                <div className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold tracking-[0.16em] text-white/80">
                  1-75
                </div>
              </div>
              <div className="flex gap-2">
                <label className="flex-1">
                  <span className="sr-only">抽選番号</span>
                  <input
                    aria-label="抽選番号"
                    autoComplete="off"
                    className="h-14 w-full rounded-[1.35rem] border-none bg-white px-5 text-2xl font-semibold text-stone-950 outline-none placeholder:text-stone-300"
                    inputMode="numeric"
                    maxLength={3}
                    pattern="[0-9]*"
                    placeholder="番号"
                    type="text"
                    value={drawInput}
                    onChange={(event) =>
                      setDrawInput(normalizeDigitInput(event.target.value))
                    }
                  />
                </label>
                <button
                  className="inline-flex h-14 min-w-24 items-center justify-center rounded-[1.35rem] bg-amber-400 px-5 text-base font-semibold text-stone-950 transition hover:bg-amber-300"
                  type="submit"
                >
                  追加
                </button>
              </div>
              {drawError ? (
                <div className="mt-3 rounded-[1.2rem] bg-rose-400/18 px-4 py-3 text-sm leading-6 text-rose-100">
                  {drawError}
                </div>
              ) : null}
            </form>
          </div>
        </>
      )}
    </div>
  );
}
