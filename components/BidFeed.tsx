"use client";

export interface BidRow {
  industryId: string;
  text: string;
  className?: string;
}

export interface Round {
  taskId: string;
  title: string;
  rows: BidRow[];
}

export function BidFeed({ rounds }: { rounds: Round[] }) {
  return (
    <section className="panel" id="bids-panel">
      <h2>Industry agent bids</h2>
      <div id="bid-feed" className="feed">
        {rounds.length === 0 && <p className="empty">Submit a task to see industry agents bid.</p>}
        {rounds.map((round) => (
          <div className="bid-round" key={round.taskId}>
            <div className="bid-round-title">{round.title}</div>
            <div>
              {round.rows.map((row, i) => (
                <div key={i} className={`bid-row${row.className ? ` ${row.className}` : ""}`}>
                  {row.text}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
