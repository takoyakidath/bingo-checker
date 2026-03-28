"use client";

import { useEffect, useRef, useState } from "react";
import {
  CARD_NUMBER_COUNT,
  clampCropRect,
  createCenteredCropRect,
  createDraftFromDetectedValues,
  getScanCellRects,
  normalizeDigitInput,
  type CropRect,
  type DraftValues,
} from "@/app/lib/bingo";

type TesseractModule = typeof import("tesseract.js");
type TesseractWorker = Awaited<ReturnType<TesseractModule["createWorker"]>>;

export type ScanStage = "idle" | "adjusting" | "recognizing" | "reviewing";

export type ScanDraft = {
  cropRect: CropRect;
  diagnostics: string[];
  imageHeight: number;
  imageUrl: string;
  imageWidth: number;
};

export type RecognizedCell = {
  confidence: number;
  index: number;
  rawText: string;
  value: number | null;
};

export type ScanReview = {
  averageConfidence: number;
  diagnostics: string[];
  draftValues: DraftValues;
  filledCount: number;
  missingCount: number;
  previewUrl: string;
  recognizedCells: RecognizedCell[];
};

const STATUS_LABELS: Record<string, string> = {
  "recognizing text": "数字を読み取り中",
  "initializing tesseract": "OCR を初期化中",
  "loading language traineddata": "言語データを読み込み中",
};

const TARGET_SCAN_SIZE = 1400;
const MIN_SCAN_EDGE = 1100;
const EDGE_MARGIN = 8;

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

async function loadImageFromUrl(url: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve(image);
    };

    image.onerror = () => {
      reject(new Error("画像を読み込めませんでした。"));
    };

    image.src = url;
  });
}

function createAdjustedCanvas(
  sourceImage: CanvasImageSource,
  cropRect: CropRect,
  imageWidth: number,
  imageHeight: number,
) {
  const safeCropRect = clampCropRect(cropRect, imageWidth, imageHeight);
  const canvas = createCanvas(TARGET_SCAN_SIZE, TARGET_SCAN_SIZE);
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("画像の切り出しに失敗しました。");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    sourceImage,
    safeCropRect.left,
    safeCropRect.top,
    safeCropRect.size,
    safeCropRect.size,
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
    const adjusted = clamp(Math.round((grayscale - 128) * 1.25 + 128), 0, 255);

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

function createCellCanvas(
  sourceCanvas: HTMLCanvasElement,
  left: number,
  top: number,
  size: number,
) {
  const canvas = createCanvas(256, 256);
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("セル画像の生成に失敗しました。");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(
    sourceCanvas,
    left,
    top,
    size,
    size,
    28,
    28,
    canvas.width - 56,
    canvas.height - 56,
  );

  return canvas;
}

function parseDetectedNumber(text: string) {
  const digits = normalizeDigitInput(text);

  if (digits.length === 0) {
    return null;
  }

  const numericValue = Number(digits);

  if (Number.isInteger(numericValue) && numericValue >= 1 && numericValue <= 75) {
    return numericValue;
  }

  return null;
}

async function recognizeCell(
  worker: TesseractWorker,
  primaryCanvas: HTMLCanvasElement,
  fallbackCanvas: HTMLCanvasElement,
  index: number,
): Promise<RecognizedCell> {
  const primaryResult = await worker.recognize(primaryCanvas);
  const primaryValue = parseDetectedNumber(primaryResult.data.text);

  if (primaryValue !== null && primaryResult.data.confidence >= 50) {
    return {
      confidence: primaryResult.data.confidence,
      index,
      rawText: primaryResult.data.text,
      value: primaryValue,
    };
  }

  const fallbackResult = await worker.recognize(fallbackCanvas);
  const fallbackValue = parseDetectedNumber(fallbackResult.data.text);

  if (fallbackValue !== null && fallbackResult.data.confidence >= primaryResult.data.confidence) {
    return {
      confidence: fallbackResult.data.confidence,
      index,
      rawText: fallbackResult.data.text,
      value: fallbackValue,
    };
  }

  return {
    confidence:
      primaryValue !== null
        ? primaryResult.data.confidence
        : fallbackResult.data.confidence,
    index,
    rawText:
      primaryValue !== null ? primaryResult.data.text : fallbackResult.data.text,
    value: primaryValue ?? fallbackValue,
  };
}

function touchesImageEdge(
  cropRect: CropRect,
  imageWidth: number,
  imageHeight: number,
) {
  return (
    cropRect.left <= EDGE_MARGIN ||
    cropRect.top <= EDGE_MARGIN ||
    cropRect.left + cropRect.size >= imageWidth - EDGE_MARGIN ||
    cropRect.top + cropRect.size >= imageHeight - EDGE_MARGIN
  );
}

function buildDraftDiagnostics(imageWidth: number, imageHeight: number) {
  const diagnostics: string[] = [];

  if (Math.min(imageWidth, imageHeight) < MIN_SCAN_EDGE) {
    diagnostics.push(
      "カードが小さく写っています。できるだけ近づいて撮ると読み取りやすくなります。",
    );
  }

  return diagnostics;
}

function buildReviewDiagnostics({
  averageConfidence,
  cropRect,
  filledCount,
  imageHeight,
  imageWidth,
}: {
  averageConfidence: number;
  cropRect: CropRect;
  filledCount: number;
  imageHeight: number;
  imageWidth: number;
}) {
  const diagnostics = buildDraftDiagnostics(imageWidth, imageHeight);
  const missingCount = CARD_NUMBER_COUNT - filledCount;

  if (missingCount >= 8) {
    diagnostics.push(
      "影が強いか、コントラストが足りない可能性があります。明るい場所で撮り直すと安定します。",
    );
  }

  if (averageConfidence < 45) {
    diagnostics.push(
      "数字がぼけている可能性があります。手ブレを抑えるか、カードに近づいて撮ってください。",
    );
  }

  if (touchesImageEdge(cropRect, imageWidth, imageHeight) && missingCount > 0) {
    diagnostics.push(
      "カードの端が切れている可能性があります。外枠全体が入るように調整し直してください。",
    );
  }

  if (missingCount >= 10) {
    diagnostics.push(
      "カードが小さすぎる可能性があります。ズームを上げるか、もう少し近づいて撮ってください。",
    );
  }

  return diagnostics;
}

export function useBingoScanner(limit = CARD_NUMBER_COUNT) {
  const workerRef = useRef<TesseractWorker | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [scanStage, setScanStage] = useState<ScanStage>("idle");
  const [scanDraft, setScanDraft] = useState<ScanDraft | null>(null);
  const [scanReview, setScanReview] = useState<ScanReview | null>(null);
  const [scanStatus, setScanStatus] = useState("");
  const [scanError, setScanError] = useState("");

  function disposePreviewUrl() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  function clearScanFeedback() {
    setScanStatus("");
    setScanError("");
  }

  function clearScanSession() {
    disposePreviewUrl();
    imageRef.current = null;
    setScanDraft(null);
    setScanReview(null);
    setScanStage("idle");
    clearScanFeedback();
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

  async function prepareScan(file: File | Blob) {
    let nextPreviewUrl: string | null = null;

    clearScanFeedback();
    setScanReview(null);
    setScanStage("idle");
    disposePreviewUrl();

    try {
      nextPreviewUrl = URL.createObjectURL(file);
      const sourceImage = await loadImageFromUrl(nextPreviewUrl);
      const cropRect = createCenteredCropRect(
        sourceImage.naturalWidth || sourceImage.width,
        sourceImage.naturalHeight || sourceImage.height,
      );

      previewUrlRef.current = nextPreviewUrl;
      imageRef.current = sourceImage;
      setScanDraft({
        cropRect,
        diagnostics: buildDraftDiagnostics(
          sourceImage.naturalWidth || sourceImage.width,
          sourceImage.naturalHeight || sourceImage.height,
        ),
        imageHeight: sourceImage.naturalHeight || sourceImage.height,
        imageUrl: nextPreviewUrl,
        imageWidth: sourceImage.naturalWidth || sourceImage.width,
      });
      setScanStage("adjusting");
      return true;
    } catch (error) {
      if (nextPreviewUrl) {
        URL.revokeObjectURL(nextPreviewUrl);
      }

      imageRef.current = null;
      setScanDraft(null);
      setScanStage("idle");
      setScanError(
        error instanceof Error
          ? `画像を準備できませんでした。${error.message}`
          : "画像を準備できませんでした。もう一度試してください。",
      );
      return false;
    }
  }

  function updateCropRect(nextCropRect: CropRect) {
    setScanDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        cropRect: clampCropRect(
          nextCropRect,
          currentDraft.imageWidth,
          currentDraft.imageHeight,
        ),
      };
    });
  }

  function resetCropRect() {
    setScanDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        cropRect: createCenteredCropRect(
          currentDraft.imageWidth,
          currentDraft.imageHeight,
        ),
      };
    });
  }

  function returnToAdjusting() {
    if (!scanDraft) {
      return;
    }

    setScanReview(null);
    setScanStage("adjusting");
    clearScanFeedback();
  }

  async function recognizeCurrentCrop() {
    const sourceImage = imageRef.current;

    if (!sourceImage || !scanDraft) {
      return null;
    }

    setScanStage("recognizing");
    setScanReview(null);
    setScanError("");
    setScanStatus("OCR を準備中です...");

    try {
      const worker = await getWorker();
      const adjustedCanvas = createAdjustedCanvas(
        sourceImage,
        scanDraft.cropRect,
        scanDraft.imageWidth,
        scanDraft.imageHeight,
      );
      const binaryCanvas = createBinaryCanvas(adjustedCanvas);
      const recognizedCells: RecognizedCell[] = [];
      const scanCellRects = getScanCellRects(TARGET_SCAN_SIZE);

      for (let cellIndex = 0; cellIndex < limit; cellIndex += 1) {
        setScanStatus(`${cellIndex + 1}/${limit} マスを読み取り中...`);
        const scanCellRect = scanCellRects[cellIndex];

        const binaryCellCanvas = createCellCanvas(
          binaryCanvas,
          scanCellRect.left,
          scanCellRect.top,
          scanCellRect.size,
        );
        const originalCellCanvas = createCellCanvas(
          adjustedCanvas,
          scanCellRect.left,
          scanCellRect.top,
          scanCellRect.size,
        );

        recognizedCells.push(
          await recognizeCell(
            worker,
            binaryCellCanvas,
            originalCellCanvas,
            cellIndex,
          ),
        );
      }

      const detectedValues = recognizedCells.map((cell) => cell.value);
      const filledCount = detectedValues.filter((value) => value !== null).length;
      const averageConfidence =
        recognizedCells.reduce((sum, cell) => sum + cell.confidence, 0) /
        recognizedCells.length;

      if (filledCount === 0) {
        setScanStage("adjusting");
        setScanStatus("");
        setScanError(
          "数字を読み取れませんでした。枠を合わせ直すか、写真を撮り直してください。",
        );
        return null;
      }

      const review: ScanReview = {
        averageConfidence,
        diagnostics: buildReviewDiagnostics({
          averageConfidence,
          cropRect: scanDraft.cropRect,
          filledCount,
          imageHeight: scanDraft.imageHeight,
          imageWidth: scanDraft.imageWidth,
        }),
        draftValues: createDraftFromDetectedValues(detectedValues),
        filledCount,
        missingCount: limit - filledCount,
        previewUrl: adjustedCanvas.toDataURL("image/jpeg", 0.92),
        recognizedCells,
      };

      setScanReview(review);
      setScanStage("reviewing");
      setScanStatus(
        filledCount === limit
          ? `${limit} マスの数字を取り込みました。`
          : `${filledCount}/${limit} マスを取り込みました。空欄だけ直してください。`,
      );
      return review;
    } catch (error) {
      setScanStage("adjusting");
      setScanStatus("");
      setScanError(
        error instanceof Error
          ? `スキャンに失敗しました。${error.message}`
          : "スキャンに失敗しました。もう一度試してください。",
      );
      return null;
    }
  }

  useEffect(() => {
    return () => {
      const worker = workerRef.current;

      if (worker) {
        workerRef.current = null;
        void worker.terminate();
      }

      disposePreviewUrl();
    };
  }, []);

  return {
    clearScanFeedback,
    clearScanSession,
    isScanning: scanStage === "recognizing",
    prepareScan,
    recognizeCurrentCrop,
    resetCropRect,
    returnToAdjusting,
    scanDraft,
    scanError,
    scanReview,
    scanStage,
    scanStatus,
    updateCropRect,
  };
}
