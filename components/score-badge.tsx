export function ScoreBadge({ score }: { score: number }) {
  const tier = score >= 80 ? "high priority" : score >= 60 ? "qualified" : "monitor";
  const className = score >= 80 ? "score-high" : score >= 60 ? "score-qualified" : "score-monitor";

  return (
    <span className={`score-badge ${className}`} aria-label={`ICP score ${score}, ${tier}`}>
      {score}
    </span>
  );
}
