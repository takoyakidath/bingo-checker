"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";
import BingoGrid from "@/app/components/bingo-grid";
import ScanAdjuster from "@/app/components/scan-adjuster";
import ScanReviewPanel from "@/app/components/scan-review-panel";
import { useCameraCapture } from "@/app/hooks/use-camera-capture";
import { useBingoScanner } from "@/app/hooks/use-bingo-scanner";
import {
  analyzeSequentialInput,
  buildCardFromDraft,
  CARD_NUMBER_COUNT,
  countFilledDraftCells,
  createDraftFromCard,
  createDraftFromSequence,
  createEmptyDraft,
  getDrawErrorMessage,
  normalizeDigitInput,
  normalizeSequentialInput,
  serializeDraftValues,
  type BingoCard,
  type DraftValues,
} from "@/app/lib/bingo";

function Notice({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "danger" | "info" | "warning";
}) {
  const toneClassName =
    tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "info"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <div
      className={`rounded-[1.4rem] border px-4 py-3 text-sm leading-6 ${toneClassName}`}
    >
      {children}
    </div>
  );
}

export default function BingoChecker() {
  const [draftValues, setDraftValues] = useState<DraftValues>(createEmptyDraft);
  const [confirmedCard, setConfirmedCard] = useState<BingoCard | null>(null);
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [sequentialInput, setSequentialInput] = useState("");
  const [drawInput, setDrawInput] = useState("");
  const [cardError, setCardError] = useState("");
  const [drawError, setDrawError] = useState("");
  const [isEditingCard, setIsEditingCard] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const {
    cameraError,
    capturePhoto,
    clearCameraError,
    closeCamera,
    isCameraOpen,
    isPreparingCamera,
    openCamera,
    videoRef,
  } = useCameraCapture();
  const {
    clearScanFeedback,
    clearScanSession,
    isScanning,
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
  } = useBingoScanner();

  const isSetupMode = !confirmedCard || isEditingCard;
  const calledNumberSet = new Set(calledNumbers);
  const reversedCalledNumbers = [...calledNumbers].reverse();
  const filledDraftCount = countFilledDraftCells(draftValues);
  const remainingDraftCount = CARD_NUMBER_COUNT - filledDraftCount;
  const { invalidTokens, numbers: sequentialNumbers } =
    analyzeSequentialInput(sequentialInput);
  const sequentialOverflowCount = Math.max(
    0,
    sequentialNumbers.length - CARD_NUMBER_COUNT,
  );
  const sanitizedSequentialNumbers = sequentialNumbers.slice(0, CARD_NUMBER_COUNT);
  const canStartCard = filledDraftCount === CARD_NUMBER_COUNT;
  const hasActiveScanSession = scanStage !== "idle";

  function clearSetupFeedback() {
    setCardError("");
    clearScanFeedback();
    clearCameraError();
  }

  function applyDraft(nextDraft: DraftValues) {
    setDraftValues(nextDraft);
    setSequentialInput(serializeDraftValues(nextDraft));
  }

  function startEditingFromConfirmedCard() {
    if (!confirmedCard) {
      return;
    }

    applyDraft(createDraftFromCard(confirmedCard));
    setDrawInput("");
    setDrawError("");
    clearSetupFeedback();
    setIsEditingCard(true);
  }

  async function beginScan(file: File | Blob) {
    clearSetupFeedback();
    await prepareScan(file);
  }

  function updateDraftValue(
    rowIndex: number,
    columnIndex: number,
    nextValue: string,
  ) {
    const sanitizedValue = normalizeDigitInput(nextValue);
    clearSetupFeedback();

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
    const nextNumbers = analyzeSequentialInput(nextInput).numbers.slice(
      0,
      CARD_NUMBER_COUNT,
    );

    clearSetupFeedback();
    clearScanSession();
    setSequentialInput(nextInput);
    setDraftValues(createDraftFromSequence(nextNumbers));
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

    await beginScan(file);
  }

  async function handleOpenCamera() {
    clearScanSession();
    clearSetupFeedback();
    await openCamera();
  }

  async function handleCaptureCamera() {
    const photo = await capturePhoto();

    if (!photo) {
      return;
    }

    if (confirmedCard && !isSetupMode) {
      startEditingFromConfirmedCard();
    }

    await beginScan(photo);
  }

  function handlePhotoPicker() {
    closeCamera();
    clearScanSession();
    clearSetupFeedback();
    scanInputRef.current?.click();
  }

  function handleApplyScanReview() {
    if (!scanReview) {
      return;
    }

    applyDraft(scanReview.draftValues);
    setCardError("");
    clearScanSession();
  }

  function handleCardSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const { card, error } = buildCardFromDraft(draftValues);

    if (!card || error) {
      setCardError(error ?? "カードを登録できませんでした。");
      return;
    }

    setConfirmedCard(card);
    applyDraft(createDraftFromCard(card));
    setCalledNumbers([]);
    setDrawInput("");
    setDrawError("");
    clearSetupFeedback();
    clearScanSession();
    closeCamera();
    setIsEditingCard(false);
  }

  function handleCancelEditing() {
    if (!confirmedCard) {
      return;
    }

    applyDraft(createDraftFromCard(confirmedCard));
    clearSetupFeedback();
    clearScanSession();
    closeCamera();
    setIsEditingCard(false);
  }

  function handleResetGame() {
    closeCamera();
    clearScanSession();
    setConfirmedCard(null);
    setDraftValues(createEmptyDraft());
    setSequentialInput("");
    setIsEditingCard(false);
    setCalledNumbers([]);
    setDrawInput("");
    setDrawError("");
    clearSetupFeedback();
  }

  function handleUndoLastNumber() {
    setCalledNumbers((currentNumbers) => currentNumbers.slice(0, -1));
    setDrawError("");
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

    setCalledNumbers((currentNumbers) => [
      ...currentNumbers,
      Number(normalizeDigitInput(drawInput.trim())),
    ]);
    setDrawInput("");
    setDrawError("");
  }

  return (
    <div
      className={`mx-auto flex max-w-3xl flex-col gap-4 ${
        isSetupMode
          ? ""
          : "pb-[calc(env(safe-area-inset-bottom)+8.5rem)] md:pb-0"
      }`}
    >
      <input
        ref={scanInputRef}
        accept="image/*"
        capture="environment"
        className="hidden"
        type="file"
        onChange={handleScanFileChange}
      />

      <section className="rounded-[2.2rem] border border-white/70 bg-white/88 p-3 shadow-[0_26px_80px_rgba(58,42,19,0.08)] backdrop-blur sm:p-5">
        {isCameraOpen ? (
          <div className="mb-5 rounded-[1.8rem] border border-stone-200 bg-stone-950 p-3 text-white shadow-[0_20px_60px_rgba(28,25,23,0.24)]">
            <div className="relative overflow-hidden rounded-[1.4rem] bg-black">
              <video
                ref={videoRef}
                autoPlay
                className="aspect-[3/4] w-full object-cover"
                muted
                playsInline
              />
              <div className="pointer-events-none absolute inset-[8%] rounded-[1.2rem] border border-white/70 shadow-[0_0_0_999px_rgba(0,0,0,0.2)]">
                <div className="grid h-full w-full grid-cols-5 grid-rows-5">
                  {Array.from({ length: 25 }, (_, index) => (
                    <div key={index} className="border border-white/12" />
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-3 px-1 text-sm leading-6 text-white/72">
              カード全体が入るように合わせてから撮影してください。
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <button
                className="inline-flex h-12 touch-manipulation items-center justify-center rounded-full bg-amber-400 px-6 text-sm font-semibold text-stone-950 transition active:scale-[0.99] hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                onClick={handleCaptureCamera}
                disabled={isScanning}
              >
                この写真で次へ
              </button>
              <button
                className="inline-flex h-12 touch-manipulation items-center justify-center rounded-full border border-white/15 bg-white/8 px-6 text-sm font-semibold text-white transition active:scale-[0.99] hover:bg-white/14"
                type="button"
                onClick={closeCamera}
              >
                閉じる
              </button>
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          {cameraError ? <Notice tone="warning">{cameraError}</Notice> : null}
          {scanStatus ? <Notice tone="info">{scanStatus}</Notice> : null}
          {scanError ? <Notice tone="warning">{scanError}</Notice> : null}
        </div>

        {isSetupMode ? (
          <form className="space-y-5" onSubmit={handleCardSubmit}>
            <div className="space-y-2 px-1">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Card Setup
              </p>
              <h1 className="text-xl font-semibold text-stone-950 sm:text-2xl">
                カードの数字を入れる
              </h1>
              <p className="text-sm leading-6 text-stone-600">
                カメラか写真で取り込んでから確認するか、そのまま文字入力してください。
              </p>
            </div>

            {confirmedCard && isEditingCard ? (
              <Notice tone="warning">
                現在の抽選履歴は保持したまま編集中です。開始し直した時点で、新しいカードとして履歴をリセットします。
              </Notice>
            ) : null}

            {hasActiveScanSession ? (
              scanStage === "reviewing" && scanReview ? (
                <ScanReviewPanel
                  review={scanReview}
                  onApply={handleApplyScanReview}
                  onRetry={returnToAdjusting}
                />
              ) : scanDraft ? (
                <div className="space-y-4">
                  <ScanAdjuster
                    cropRect={scanDraft.cropRect}
                    disabled={isScanning}
                    imageHeight={scanDraft.imageHeight}
                    imageUrl={scanDraft.imageUrl}
                    imageWidth={scanDraft.imageWidth}
                    onChangeCrop={updateCropRect}
                    onResetCrop={resetCropRect}
                  />

                  {scanDraft.diagnostics.length > 0 ? (
                    <Notice tone="warning">
                      <div className="space-y-1">
                        {scanDraft.diagnostics.map((message) => (
                          <p key={message}>・{message}</p>
                        ))}
                      </div>
                    </Notice>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      className="inline-flex h-12 touch-manipulation items-center justify-center rounded-full bg-stone-900 px-6 text-sm font-semibold text-white transition active:scale-[0.99] hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                      type="button"
                      onClick={() => {
                        void recognizeCurrentCrop();
                      }}
                      disabled={isScanning}
                    >
                      {isScanning ? "読み取り中..." : "この範囲で読み取る"}
                    </button>
                    <button
                      className="inline-flex h-12 touch-manipulation items-center justify-center rounded-full border border-stone-300 bg-white px-6 text-sm font-semibold text-stone-700 transition active:scale-[0.99] hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                      type="button"
                      onClick={clearScanSession}
                      disabled={isScanning}
                    >
                      やめる
                    </button>
                  </div>
                </div>
              ) : null
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    className="inline-flex h-14 touch-manipulation items-center justify-center rounded-[1.35rem] bg-stone-900 px-5 text-sm font-semibold text-white transition active:scale-[0.99] hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    onClick={handleOpenCamera}
                    disabled={isScanning || isPreparingCamera}
                  >
                    {isPreparingCamera ? "カメラを起動中..." : "カメラでスキャン"}
                  </button>
                  <button
                    className="inline-flex h-14 touch-manipulation items-center justify-center rounded-[1.35rem] border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-700 transition active:scale-[0.99] hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    onClick={handlePhotoPicker}
                    disabled={isScanning || isPreparingCamera}
                  >
                    写真から読み込む
                  </button>
                </div>

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
                      {sanitizedSequentialNumbers.length}/{CARD_NUMBER_COUNT}
                    </div>
                  </div>
                  <textarea
                    className="mt-3 min-h-28 w-full resize-y rounded-[1.35rem] border border-stone-200 bg-white px-4 py-3 text-base leading-7 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-400"
                    enterKeyHint="done"
                    placeholder="例: 5 12 31 44 67 8 16 39 ..."
                    spellCheck={false}
                    value={sequentialInput}
                    onChange={handleSequentialInputChange}
                  />
                  <p className="mt-2 text-xs leading-6 text-stone-500">
                    スペース、改行、カンマで区切れます。1 から 75 の数字だけを使ってください。
                  </p>
                  {invalidTokens.length > 0 ? (
                    <p className="mt-2 text-xs leading-6 text-amber-700">
                      範囲外の数字 {invalidTokens.length} 個は反映していません。
                    </p>
                  ) : null}
                  {sequentialOverflowCount > 0 ? (
                    <p className="mt-2 text-xs leading-6 text-amber-700">
                      25個目以降の {sequentialOverflowCount} 個は無視しています。
                    </p>
                  ) : null}
                </div>

                <BingoGrid
                  draftValues={draftValues}
                  mode="edit"
                  onChangeCell={updateDraftValue}
                />

                {cardError ? <Notice tone="danger">{cardError}</Notice> : null}

                <div className="rounded-[1.6rem] bg-stone-900 p-4 text-white shadow-[0_20px_50px_rgba(28,25,23,0.28)]">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-white/60">
                        Ready
                      </p>
                      <p className="mt-2 text-3xl font-semibold">
                        {filledDraftCount}
                        <span className="ml-2 text-base font-medium text-white/55">
                          / {CARD_NUMBER_COUNT}
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
                      className="inline-flex h-12 flex-1 touch-manipulation items-center justify-center rounded-full bg-amber-400 px-6 text-sm font-semibold text-stone-950 transition active:scale-[0.99] hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canStartCard || isPreparingCamera}
                      type="submit"
                    >
                      このカードで開始する
                    </button>
                    {confirmedCard && isEditingCard ? (
                      <button
                        className="inline-flex h-12 touch-manipulation items-center justify-center rounded-full border border-white/20 bg-white/8 px-6 text-sm font-semibold text-white transition active:scale-[0.99] hover:bg-white/14"
                        type="button"
                        onClick={handleCancelEditing}
                      >
                        編集をやめる
                      </button>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </form>
        ) : confirmedCard ? (
          <div className="space-y-4">
            <BingoGrid
              calledNumbers={calledNumberSet}
              card={confirmedCard}
              mode="play"
            />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                className="inline-flex h-11 touch-manipulation items-center justify-center rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition active:scale-[0.99] hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                type="button"
                onClick={handleUndoLastNumber}
                disabled={calledNumbers.length === 0}
              >
                直前を取り消す
              </button>
              <button
                className="inline-flex h-11 touch-manipulation items-center justify-center rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition active:scale-[0.99] hover:border-stone-400 hover:bg-stone-50"
                type="button"
                onClick={handleResetGame}
              >
                ゲームをリセット
              </button>
              <button
                className="col-span-2 inline-flex h-11 touch-manipulation items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-900 transition active:scale-[0.99] hover:border-amber-400 hover:bg-amber-100 sm:col-span-1 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                onClick={handlePhotoPicker}
                disabled={isScanning}
              >
                スキャン
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
                <h2 className="mt-2 text-xl font-semibold text-stone-900">
                  入力した番号
                </h2>
              </div>
              <div className="rounded-full bg-stone-900 px-3 py-2 text-xs font-semibold tracking-[0.16em] text-white">
                {calledNumbers.length} 件
              </div>
            </div>

            {calledNumbers.length === 0 ? (
              <p className="mt-4 rounded-[1.5rem] border border-dashed border-stone-300 bg-stone-50 px-4 py-5 text-sm leading-7 text-stone-500">
                まだ抽選番号はありません。下の入力バーから番号を追加すると、ここへ新しい順で並びます。
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
              className="rounded-[1.9rem] border border-stone-900/85 bg-stone-950/96 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] text-white shadow-[0_24px_70px_rgba(28,25,23,0.38)] backdrop-blur md:pb-3"
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
                    autoCapitalize="off"
                    autoComplete="off"
                    className="h-14 w-full rounded-[1.35rem] border-none bg-white px-5 text-2xl font-semibold text-stone-950 outline-none placeholder:text-stone-300"
                    enterKeyHint="done"
                    inputMode="numeric"
                    maxLength={3}
                    pattern="[0-9]*"
                    placeholder="番号"
                    spellCheck={false}
                    type="text"
                    value={drawInput}
                    onChange={(event) =>
                      setDrawInput(normalizeDigitInput(event.target.value))
                    }
                  />
                </label>
                <button
                  className="inline-flex h-14 min-w-24 touch-manipulation items-center justify-center rounded-[1.35rem] bg-amber-400 px-5 text-base font-semibold text-stone-950 transition active:scale-[0.99] hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={drawInput.trim().length === 0}
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
