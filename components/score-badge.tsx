export function ScoreBadge({ score }: { score: number }) {
  const tier = score >= 80 ? "top match" : score >= 60 ? "worth contacting" : "low fit";
  const className = score >= 80 ? "score-high" : score >= 60 ? "score-qualified" : "score-monitor";

  return (
    <span className={`score-badge ${className}`} aria-label={`Fit score ${score} out of 100, ${tier}`}>
      {score}
    </span>
  );
}
