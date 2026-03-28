"use client";

import { useEffect, useRef, useState } from "react";
import {
  CARD_NUMBER_COUNT,
  extractNumbersFromSequentialInput,
} from "@/app/lib/bingo";

type TesseractModule = typeof import("tesseract.js");
type TesseractWorker = Awaited<ReturnType<TesseractModule["createWorker"]>>;

type ScanResult = {
  numbers: number[];
};

const STATUS_LABELS: Record<string, string> = {
  "recognizing text": "数字を読み取り中",
  "initializing tesseract": "OCR を初期化中",
  "loading language traineddata": "言語データを読み込み中",
};

function getScanStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? "スキャン中";
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
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
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
      const {
        data: { text },
      } = await worker.recognize(file);
      const recognizedNumbers = extractNumbersFromSequentialInput(text);

      if (recognizedNumbers.length === 0) {
        setScanStatus("");
        setScanError(
          "数字を読み取れませんでした。写真を撮り直すか、下の文字入力で補正してください。",
        );
        return null;
      }

      const nextNumbers = recognizedNumbers.slice(0, limit);

      if (recognizedNumbers.length < limit) {
        setScanStatus("");
        setScanError(
          `読み取れた数字は ${recognizedNumbers.length} 個でした。足りないマスは文字入力かマス入力で補正してください。`,
        );
      } else if (recognizedNumbers.length > limit) {
        setScanStatus("");
        setScanError(
          `読み取れた数字が ${recognizedNumbers.length} 個あったため、先頭${limit}個だけ反映しました。必要なら文字入力で直してください。`,
        );
      } else {
        setScanStatus(
          `${limit}個の数字を取り込みました。内容を確認して開始してください。`,
        );
        setScanError("");
      }

      return { numbers: nextNumbers };
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
