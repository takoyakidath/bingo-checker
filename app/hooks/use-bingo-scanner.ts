"use client";

import { useEffect, useRef, useState } from "react";
import {
  CARD_NUMBER_COUNT,
  createDraftFromDetectedValues,
  INPUT_COORDINATES,
  normalizeDigitInput,
  type DraftValues,
} from "@/app/lib/bingo";

type TesseractModule = typeof import("tesseract.js");
type TesseractWorker = Awaited<ReturnType<TesseractModule["createWorker"]>>;

type ScanResult = {
  draftValues: DraftValues;
};

const STATUS_LABELS: Record<string, string> = {
  "recognizing text": "数字を読み取り中",
  "initializing tesseract": "OCR を初期化中",
  "loading language traineddata": "言語データを読み込み中",
};

const TARGET_SCAN_SIZE = 1400;
const GRID_INSET_RATIO = 0.03;
const CELL_INSET_RATIO = 0.18;
const CELL_SCAN_SIZE = 256;
const CELL_MARGIN = 28;

type CellRecognition = {
  confidence: number;
  value: number | null;
};

function getScanStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? "スキャン中";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function computeOtsuThreshold(histogram: number[], totalPixels: number) {
  let sum = 0;

  for (let index = 0; index < histogram.length; index += 1) {
    sum += index * histogram[index];
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = 0;
  let threshold = 127;

  for (let index = 0; index < histogram.length; index += 1) {
    weightBackground += histogram[index];

    if (weightBackground === 0) {
      continue;
    }

    const weightForeground = totalPixels - weightBackground;

    if (weightForeground === 0) {
      break;
    }

    sumBackground += index * histogram[index];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance =
      weightBackground *
      weightForeground *
      (meanBackground - meanForeground) ** 2;

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = index;
    }
  }

  return threshold;
}

async function loadImage(file: File | Blob) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("画像を読み込めませんでした。"));
    };

    image.src = objectUrl;
  });
}

function createNormalizedCanvas(sourceImage: CanvasImageSource & {
  width: number;
  height: number;
}) {
  const cropSize = Math.min(sourceImage.width, sourceImage.height);
  const offsetX = (sourceImage.width - cropSize) / 2;
  const offsetY = (sourceImage.height - cropSize) / 2;
  const canvas = createCanvas(TARGET_SCAN_SIZE, TARGET_SCAN_SIZE);
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("画像の前処理に失敗しました。");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    sourceImage,
    offsetX,
    offsetY,
    cropSize,
    cropSize,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return canvas;
}

function createBinaryCanvas(sourceCanvas: HTMLCanvasElement) {
  const canvas = createCanvas(sourceCanvas.width, sourceCanvas.height);
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("画像の二値化に失敗しました。");
  }

  context.drawImage(sourceCanvas, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const histogram = new Array<number>(256).fill(0);
  const grayscaleValues = new Uint8Array(canvas.width * canvas.height);

  for (let index = 0; index < grayscaleValues.length; index += 1) {
    const offset = index * 4;
    const grayscale =
      imageData.data[offset] * 0.299 +
      imageData.data[offset + 1] * 0.587 +
      imageData.data[offset + 2] * 0.114;
    const adjusted = clamp(Math.round((grayscale - 128) * 1.35 + 128), 0, 255);

    grayscaleValues[index] = adjusted;
    histogram[adjusted] += 1;
  }

  const threshold = computeOtsuThreshold(histogram, grayscaleValues.length);

  for (let index = 0; index < grayscaleValues.length; index += 1) {
    const offset = index * 4;
    const value = grayscaleValues[index] > threshold ? 255 : 0;

    imageData.data[offset] = value;
    imageData.data[offset + 1] = value;
    imageData.data[offset + 2] = value;
    imageData.data[offset + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function createCellCanvas(sourceCanvas: HTMLCanvasElement, cellIndex: number) {
  const { rowIndex, columnIndex } = INPUT_COORDINATES[cellIndex];
  const gridInset = sourceCanvas.width * GRID_INSET_RATIO;
  const gridSize = sourceCanvas.width - gridInset * 2;
  const cellSize = gridSize / 5;
  const cellInset = cellSize * CELL_INSET_RATIO;
  const cropLeft = gridInset + columnIndex * cellSize + cellInset;
  const cropTop = gridInset + rowIndex * cellSize + cellInset;
  const cropSize = cellSize - cellInset * 2;
  const canvas = createCanvas(CELL_SCAN_SIZE, CELL_SCAN_SIZE);
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("セル画像の生成に失敗しました。");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(
    sourceCanvas,
    cropLeft,
    cropTop,
    cropSize,
    cropSize,
    CELL_MARGIN,
    CELL_MARGIN,
    canvas.width - CELL_MARGIN * 2,
    canvas.height - CELL_MARGIN * 2,
  );

  return canvas;
}

function parseDetectedNumber(text: string) {
  const digits = normalizeDigitInput(text);

  if (digits.length === 0) {
    return null;
  }

  const numericValue = Number(digits);

  if (
    Number.isInteger(numericValue) &&
    numericValue >= 1 &&
    numericValue <= 75
  ) {
    return numericValue;
  }

  return null;
}

async function recognizeCell(
  worker: TesseractWorker,
  primaryCanvas: HTMLCanvasElement,
  fallbackCanvas: HTMLCanvasElement,
) {
  const primaryResult = await worker.recognize(primaryCanvas);
  const primaryRecognition: CellRecognition = {
    confidence: primaryResult.data.confidence,
    value: parseDetectedNumber(primaryResult.data.text),
  };

  if (
    primaryRecognition.value !== null &&
    primaryRecognition.confidence >= 50
  ) {
    return primaryRecognition;
  }

  const fallbackResult = await worker.recognize(fallbackCanvas);
  const fallbackRecognition: CellRecognition = {
    confidence: fallbackResult.data.confidence,
    value: parseDetectedNumber(fallbackResult.data.text),
  };

  if (
    fallbackRecognition.value !== null &&
    fallbackRecognition.confidence >= primaryRecognition.confidence
  ) {
    return fallbackRecognition;
  }

  return primaryRecognition.value !== null
    ? primaryRecognition
    : fallbackRecognition;
}

export function useBingoScanner(limit = CARD_NUMBER_COUNT) {
  const workerRef = useRef<TesseractWorker | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [scanError, setScanError] = useState("");

  function clearScanFeedback() {
    setScanStatus("");
    setScanError("");
  }

  async function getWorker() {
    if (workerRef.current) {
      return workerRef.current;
    }

    const Tesseract = await import("tesseract.js");
    const nextWorker = await Tesseract.createWorker("eng", 1, {
      logger: ({ progress, status }) => {
        setScanStatus(
          `${getScanStatusLabel(status)} ${Math.round(progress * 100)}%`,
        );
      },
    });

    await nextWorker.setParameters({
      tessedit_char_whitelist: "0123456789",
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_WORD,
      user_defined_dpi: "300",
    });

    workerRef.current = nextWorker;
    return nextWorker;
  }

  async function scanFile(file: File | Blob): Promise<ScanResult | null> {
    setIsScanning(true);
    setScanError("");
    setScanStatus("OCR を準備中です...");

    try {
      const worker = await getWorker();
      const sourceImage = await loadImage(file);
      const normalizedCanvas = createNormalizedCanvas(sourceImage);
      const binaryCanvas = createBinaryCanvas(normalizedCanvas);
      const detectedValues: Array<number | null> = [];

      for (let cellIndex = 0; cellIndex < limit; cellIndex += 1) {
        setScanStatus(`${cellIndex + 1}/${limit} マスを読み取り中...`);

        const binaryCellCanvas = createCellCanvas(binaryCanvas, cellIndex);
        const normalizedCellCanvas = createCellCanvas(normalizedCanvas, cellIndex);
        const recognition = await recognizeCell(
          worker,
          binaryCellCanvas,
          normalizedCellCanvas,
        );

        detectedValues.push(recognition.value);
      }

      const filledCount = detectedValues.filter((value) => value !== null).length;

      if (filledCount === 0) {
        setScanStatus("");
        setScanError(
          "数字を読み取れませんでした。写真を撮り直すか、下の文字入力で補正してください。",
        );
        return null;
      }

      const draftValues = createDraftFromDetectedValues(detectedValues);

      if (filledCount < limit) {
        setScanStatus("");
        setScanError(
          `${limit} マス中 ${filledCount} マスだけ取り込みました。空欄はそのまま残すので、足りないマスだけ手で直してください。`,
        );
      } else {
        setScanStatus(
          `${limit} マスの数字を取り込みました。内容を確認して開始してください。`,
        );
        setScanError("");
      }

      return { draftValues };
    } catch (error) {
      setScanStatus("");
      setScanError(
        error instanceof Error
          ? `スキャンに失敗しました。${error.message}`
          : "スキャンに失敗しました。もう一度試してください。",
      );
      return null;
    } finally {
      setIsScanning(false);
    }
  }

  useEffect(() => {
    return () => {
      const worker = workerRef.current;

      if (worker) {
        workerRef.current = null;
        void worker.terminate();
      }
    };
  }, []);

  return {
    clearScanFeedback,
    isScanning,
    scanError,
    scanFile,
    scanStatus,
  };
}
