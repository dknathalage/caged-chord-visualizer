<script>
  let { history = [] } = $props();

  const w = 80, h = 20, pad = 2;

  let points = $derived.by(() => {
    if (!history || history.length < 2) return '';
    const thetas = history.map(item => item.theta);
    const min = Math.min(...thetas);
    const max = Math.max(...thetas);
    const range = max - min || 0.01;
    return thetas.map((t, i) => {
      const x = pad + (i / (thetas.length - 1)) * (w - pad * 2);
      const y = h - pad - ((t - min) / range) * (h - pad * 2);
      return `${x},${y}`;
    }).join(' ');
  });
</script>

{#if history && history.length >= 2}
  <svg width={w} height={h} viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg">
    <polyline points={points} fill="none" stroke="var(--ac)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
{/if}
