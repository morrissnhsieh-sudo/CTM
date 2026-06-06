export function GridSkeleton() {
  return (
    <div className="w-full h-full bg-background animate-pulse">
      {/* Header row */}
      <div className="h-8 bg-muted border-b border-border flex">
        <div className="w-12 bg-muted-foreground/5 border-r border-border" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="w-36 h-full border-r border-border bg-muted-foreground/5 flex items-center px-3">
            <div className="h-3 w-20 bg-muted-foreground/20 rounded" />
          </div>
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: 20 }).map((_, row) => (
        <div key={row} className="h-8 border-b border-border flex">
          <div className="w-12 bg-muted-foreground/5 border-r border-border flex items-center justify-end px-2">
            <div className="h-3 w-6 bg-muted-foreground/15 rounded" />
          </div>
          {Array.from({ length: 8 }).map((_, col) => (
            <div key={col} className="w-36 h-full border-r border-border px-3 flex items-center">
              {((row * 7 + col * 13) % 10) > 3 && (
                <div className="h-3 rounded bg-muted-foreground/10" style={{ width: `${30 + ((row * 11 + col * 17) % 61)}%` }} />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
