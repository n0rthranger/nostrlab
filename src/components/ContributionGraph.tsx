import { useState, useEffect } from "react";
import { pool, DEFAULT_RELAYS } from "../lib/nostr";
import { ISSUE, PATCH, PULL_REQUEST, COMMENT, CODE_SNIPPET, REPO_ANNOUNCEMENT } from "../types/nostr";

interface Props {
  pubkey: string;
}

interface DayData {
  date: string;
  count: number;
}

export default function ContributionGraph({ pubkey }: Props) {
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalContributions, setTotalContributions] = useState(0);

  useEffect(() => {
    if (!pubkey) return;
    let cancelled = false;

    const now = Math.floor(Date.now() / 1000);
    const oneYearAgo = now - 365 * 86400;

    pool.querySync(DEFAULT_RELAYS, {
      kinds: [REPO_ANNOUNCEMENT, ISSUE, PATCH, PULL_REQUEST, COMMENT, CODE_SNIPPET],
      authors: [pubkey],
      since: oneYearAgo,
      limit: 2000,
    }).then((events) => {
      if (cancelled) return;

      const counts: Record<string, number> = {};
      for (const ev of events) {
        const date = new Date(ev.created_at * 1000).toISOString().slice(0, 10);
        counts[date] = (counts[date] ?? 0) + 1;
      }

      const days: DayData[] = [];
      const d = new Date(oneYearAgo * 1000);
      while (d.getTime() / 1000 <= now) {
        const dateStr = d.toISOString().slice(0, 10);
        days.push({ date: dateStr, count: counts[dateStr] ?? 0 });
        d.setDate(d.getDate() + 1);
      }

      setData(days);
      setTotalContributions(events.length);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [pubkey]);

  if (loading) return null;

  const getColor = (count: number) => {
    if (count === 0) return "bg-bg-tertiary";
    if (count <= 2) return "bg-green/30";
    if (count <= 5) return "bg-green/50";
    if (count <= 10) return "bg-green/70";
    return "bg-green";
  };

  // Group by weeks (columns)
  const weeks: DayData[][] = [];
  let currentWeek: DayData[] = [];
  // Pad first week
  if (data.length > 0) {
    const firstDay = new Date(data[0].date).getDay();
    for (let i = 0; i < firstDay; i++) {
      currentWeek.push({ date: "", count: -1 });
    }
  }
  for (const day of data) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  return (
    <div className="border border-border rounded-xl bg-bg-secondary p-4">
      <div className="text-sm text-text-secondary mb-3">
        <strong className="text-text-primary">{totalContributions}</strong> contributions in the last year
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-[3px]" style={{ minWidth: "max-content" }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((day, di) => (
                <div
                  key={di}
                  className={`w-[11px] h-[11px] rounded-sm ${day.count < 0 ? "bg-transparent" : getColor(day.count)}`}
                  title={day.date ? `${day.date}: ${day.count} contributions` : ""}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1 mt-2 justify-end text-[10px] text-text-muted">
        <span>Less</span>
        <div className="w-[11px] h-[11px] rounded-sm bg-bg-tertiary" />
        <div className="w-[11px] h-[11px] rounded-sm bg-green/30" />
        <div className="w-[11px] h-[11px] rounded-sm bg-green/50" />
        <div className="w-[11px] h-[11px] rounded-sm bg-green/70" />
        <div className="w-[11px] h-[11px] rounded-sm bg-green" />
        <span>More</span>
      </div>
    </div>
  );
}
