<script>
  let { coverage = null } = $props();

  const zones = ['zone_0', 'zone_3', 'zone_5', 'zone_7', 'zone_9', 'zone_12'];
  const zoneLabels = ['0', '3', '5', '7', '9', '12+'];
  const strNames = ['e', 'B', 'G', 'D', 'A', 'E'];
  const cellW = 28, cellH = 18, padL = 24, padT = 16, gap = 2;
  const w = padL + zones.length * (cellW + gap);
  const h = padT + 6 * (cellH + gap);

  function cellData(s, z) {
    if (!coverage) return { count: 0, avgPL: 0 };
    const key = `str_${s}:${zones[z]}`;
    return coverage[key] || { count: 0, avgPL: 0 };
  }

  function cellFill(cell) {
    if (cell.count === 0) return '#30363D';
    if (cell.avgPL >= 0.8) return '#4ECB71';
    if (cell.avgPL >= 0.4) return '#F0A030';
    return '#FF6B6B';
  }

  function cellOpacity(cell) {
    if (cell.count === 0) return 0.08;
    return Math.min(1, 0.3 + cell.count * 0.15);
  }
</script>

{#if coverage}
  <svg width={w} height={h} viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg">
    {#each zones as _, z}
      <text x={padL + z * (cellW + gap) + cellW / 2} y="10" text-anchor="middle" fill="var(--mt)" font-size="8" font-family="JetBrains Mono">{zoneLabels[z]}</text>
    {/each}
    {#each strNames as name, s}
      <text x={padL - 6} y={padT + s * (cellH + gap) + cellH / 2 + 3} text-anchor="end" fill="var(--mt)" font-size="8" font-family="JetBrains Mono">{name}</text>
    {/each}
    {#each { length: 6 } as _, s}
      {#each { length: zones.length } as _, z}
        {@const cell = cellData(s, z)}
        {@const x = padL + z * (cellW + gap)}
        {@const y = padT + s * (cellH + gap)}
        <rect {x} {y} width={cellW} height={cellH} rx="3" fill={cellFill(cell)} opacity={cellOpacity(cell)}/>
        {#if cell.count > 0}
          <text x={x + cellW / 2} y={y + cellH / 2 + 3} text-anchor="middle" fill="#fff" font-size="7" font-family="JetBrains Mono" opacity="0.9">{Math.round(cell.avgPL * 100)}</text>
        {/if}
      {/each}
    {/each}
  </svg>
{/if}
