import Image from "next/image";
import BingoGrid from "@/app/components/bingo-grid";
import { CARD_NUMBER_COUNT } from "@/app/lib/bingo";
import type { ScanReview } from "@/app/hooks/use-bingo-scanner";

type ScanReviewPanelProps = {
  disabled?: boolean;
  onApply: () => void;
  onRetry: () => void;
  review: ScanReview;
};

export default function ScanReviewPanel({
  disabled = false,
  onApply,
  onRetry,
  review,
}: ScanReviewPanelProps) {
  return (
    <div className="space-y-4 rounded-[1.8rem] border border-stone-200 bg-stone-50 p-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
          読み取り結果
        </p>
        <p className="text-sm leading-6 text-stone-700">
          空欄だけ手で直せます。違和感があれば、先に枠を合わせ直してください。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-[1.4rem] bg-stone-950">
            <Image
              alt="読み取りに使ったカード"
              className="aspect-square w-full object-cover"
              height={420}
              src={review.previewUrl}
              unoptimized
              width={420}
            />
            <div className="pointer-events-none absolute inset-0 grid grid-cols-5 grid-rows-5">
              {Array.from({ length: 25 }, (_, index) => (
                <div key={index} className="border border-white/14" />
              ))}
            </div>
          </div>

          <div className="rounded-[1.35rem] bg-white p-3 ring-1 ring-inset ring-stone-200">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-stone-700">取り込み状況</p>
              <div className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold tracking-[0.16em] text-stone-700">
                {review.filledCount}/{CARD_NUMBER_COUNT}
              </div>
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              空欄 {review.missingCount} マス / 平均信頼度{" "}
              {Math.round(review.averageConfidence)}%
            </p>
          </div>
        </div>

        <BingoGrid draftValues={review.draftValues} mode="review" />
      </div>

      {review.diagnostics.length > 0 ? (
        <div className="rounded-[1.35rem] border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <p className="font-semibold">読み取りが弱いときのヒント</p>
          <ul className="mt-2 space-y-1">
            {review.diagnostics.map((message) => (
              <li key={message}>・{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          className="inline-flex h-12 touch-manipulation items-center justify-center rounded-full bg-stone-900 px-6 text-sm font-semibold text-white transition active:scale-[0.99] hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={onApply}
          disabled={disabled}
        >
          この内容で反映
        </button>
        <button
          className="inline-flex h-12 touch-manipulation items-center justify-center rounded-full border border-stone-300 bg-white px-6 text-sm font-semibold text-stone-700 transition active:scale-[0.99] hover:border-stone-400 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={onRetry}
          disabled={disabled}
        >
          調整し直す
        </button>
      </div>
    </div>
  );
}
