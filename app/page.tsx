import BingoChecker from "@/app/components/bingo-checker";

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <BingoChecker />
      </div>
    </main>
  );
}
