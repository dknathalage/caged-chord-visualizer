<script>
  let { percent = 0, color = '#58A6FF', size = 64 } = $props();

  let r = $derived((size - 6) / 2);
  let cx = $derived(size / 2);
  let cy = $derived(size / 2);
  let circ = $derived(2 * Math.PI * r);
  let dash = $derived((percent / 100) * circ);
  let gap = $derived(circ - dash);
</script>

<svg width={size} height={size} viewBox="0 0 {size} {size}" xmlns="http://www.w3.org/2000/svg">
  <circle cx={cx} cy={cy} r={r} fill="none" stroke="#30363D" stroke-width="3"/>
  {#if percent > 0}
    <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} stroke-width="3"
      stroke-dasharray="{dash} {gap}" stroke-linecap="round"
      transform="rotate(-90 {cx} {cy})"/>
  {/if}
</svg>
